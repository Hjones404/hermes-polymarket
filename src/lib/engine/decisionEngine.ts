import { db } from "../db";
import { fetchMarketQuote } from "../adapters/polymarketAdapter";
import { scoreTrade } from "../scoring/tradeScoring";
import { getActiveRules } from "./ruleEngine";

export interface ScoreTradesSummary {
  scored: number;
  paperCopy: number;
  watchlist: number;
  skip: number;
  errors: string[];
}

export async function scoreUnscoredTrades(): Promise<ScoreTradesSummary> {
  const rules = await getActiveRules();
  const unscored = await db.observedTrade.findMany({
    where: { decision: { is: null } },
    include: { wallet: true },
    orderBy: { timestamp: "asc" },
  });

  const summary: ScoreTradesSummary = { scored: 0, paperCopy: 0, watchlist: 0, skip: 0, errors: [] };

  for (const ot of unscored) {
    const quoteResult = await fetchMarketQuote(ot.marketId);
    if (!quoteResult.ok) {
      summary.errors.push(`Market ${ot.marketId}: ${quoteResult.error}`);
      continue;
    }

    const categoryStrengths = ot.wallet.categoryStrengthsJson ? JSON.parse(ot.wallet.categoryStrengthsJson) : {};
    const walletCategoryScore = categoryStrengths[ot.marketCategory || ""] ?? 0.5;

    const scored = scoreTrade({
      trade: {
        walletAddress: ot.walletAddress,
        marketId: ot.marketId,
        conditionId: ot.conditionId || undefined,
        marketQuestion: ot.marketQuestion,
        marketCategory: ot.marketCategory || undefined,
        outcome: ot.outcome,
        side: ot.side as "buy" | "sell",
        entryPrice: ot.walletEntryPrice,
        size: ot.size,
        timestamp: ot.timestamp.toISOString(),
      },
      walletGlobalScore: ot.wallet.globalScore,
      walletCategoryScore,
      quote: quoteResult.data,
      rules,
    });

    const journal = await db.decisionJournal.create({
      data: {
        observedTradeId: ot.id,
        walletAddress: ot.walletAddress,
        marketId: ot.marketId,
        decision: scored.decision,
        copyScore: scored.copyScore,
        confidence: scored.confidence,
        reasonsJson: JSON.stringify(scored.reasons),
        risksJson: JSON.stringify(scored.risks),
        walletQualityScore: scored.breakdown.walletQualityScore,
        roiScore: scored.breakdown.roiScore,
        consistencyScore: scored.breakdown.consistencyScore,
        copyabilityScore: scored.breakdown.copyabilityScore,
        categoryFitScore: scored.breakdown.categoryFitScore,
        entryTimingScore: scored.breakdown.entryTimingScore,
        spreadScore: scored.breakdown.spreadScore,
        liquidityScore: scored.breakdown.liquidityScore,
        thesisScore: scored.breakdown.thesisScore,
        simulatedPositionSize: scored.simulatedPositionSize,
      },
    });

    if (scored.decision === "paper_copy" && scored.simulatedPositionSize) {
      const currentPrice = ot.outcome === "YES" ? quoteResult.data.yesPrice : quoteResult.data.noPrice;
      await db.paperTrade.create({
        data: {
          decisionJournalId: journal.id,
          walletAddress: ot.walletAddress,
          marketId: ot.marketId,
          outcome: ot.outcome,
          side: ot.side,
          entryPrice: currentPrice,
          currentPrice,
          simulatedPositionSize: scored.simulatedPositionSize,
          unrealizedPnl: 0,
          status: "open",
        },
      });
      summary.paperCopy++;
    } else if (scored.decision === "watchlist") {
      summary.watchlist++;
    } else {
      summary.skip++;
    }
    summary.scored++;
  }

  return summary;
}
