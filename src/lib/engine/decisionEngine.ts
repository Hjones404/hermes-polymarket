import { db } from "../db";
import { fetchMarketQuote } from "../adapters/polymarketAdapter";
import { scoreTrade } from "../scoring/tradeScoring";
import { getActiveRules } from "./ruleEngine";
import { getBankrollSummary } from "./bankroll";

export interface ScoreTradesSummary {
  scored: number;
  paperCopy: number;
  watchlist: number;
  skip: number;
  bankrollBlocked: number;
  errors: string[];
}

/**
 * Scores unscored ObservedTrades into DecisionJournal + PaperTrade rows.
 *
 * maxPerRun bounds how many trades a single invocation will process, so a
 * large backlog can't cause one run to take so long that the next cron tick
 * fires on top of it. Combined with the flock in deploy/run-job.sh, this
 * keeps runs from overlapping and double-spending the paper bankroll.
 */
export async function scoreUnscoredTrades(maxPerRun = 300): Promise<ScoreTradesSummary> {
  const rules = await getActiveRules();
  const bankroll = await getBankrollSummary();
  let availableCash = bankroll.availableCash;

  const unscored = await db.observedTrade.findMany({
    where: { decision: { is: null } },
    include: { wallet: true },
    orderBy: { timestamp: "asc" },
    take: maxPerRun,
  });

  const summary: ScoreTradesSummary = { scored: 0, paperCopy: 0, watchlist: 0, skip: 0, bankrollBlocked: 0, errors: [] };

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

    // Bankroll gate: a paper_copy decision only actually opens a position if
    // there's simulated cash left to stake. Otherwise it's downgraded to
    // skip and logged as such — this is what makes "would $X have survived
    // this" a real test instead of an unconstrained simulation.
    let finalDecision = scored.decision;
    let finalSize = scored.simulatedPositionSize;
    const reasons = [...scored.reasons];
    const risks = [...scored.risks];
    let bankrollBlocked = false;

    if (finalDecision === "paper_copy" && finalSize) {
      if (finalSize > availableCash) {
        bankrollBlocked = true;
        finalDecision = "skip";
        risks.push(`Insufficient paper bankroll: needed $${finalSize.toFixed(2)}, only $${availableCash.toFixed(2)} available.`);
        finalSize = null;
      }
    }

    const journal = await db.decisionJournal.create({
      data: {
        observedTradeId: ot.id,
        walletAddress: ot.walletAddress,
        marketId: ot.marketId,
        decision: finalDecision,
        copyScore: scored.copyScore,
        confidence: scored.confidence,
        reasonsJson: JSON.stringify(reasons),
        risksJson: JSON.stringify(risks),
        walletQualityScore: scored.breakdown.walletQualityScore,
        roiScore: scored.breakdown.roiScore,
        consistencyScore: scored.breakdown.consistencyScore,
        copyabilityScore: scored.breakdown.copyabilityScore,
        categoryFitScore: scored.breakdown.categoryFitScore,
        entryTimingScore: scored.breakdown.entryTimingScore,
        spreadScore: scored.breakdown.spreadScore,
        liquidityScore: scored.breakdown.liquidityScore,
        thesisScore: scored.breakdown.thesisScore,
        simulatedPositionSize: finalSize,
      },
    });

    if (finalDecision === "paper_copy" && finalSize) {
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
          simulatedPositionSize: finalSize,
          unrealizedPnl: 0,
          status: "open",
        },
      });
      availableCash -= finalSize;
      summary.paperCopy++;
    } else if (finalDecision === "watchlist") {
      summary.watchlist++;
    } else {
      summary.skip++;
      if (bankrollBlocked) summary.bankrollBlocked++;
    }
    summary.scored++;
  }

  return summary;
}
