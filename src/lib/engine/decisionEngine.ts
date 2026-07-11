import { db } from "../db";
import { fetchMarketQuotesBatch } from "../adapters/polymarketAdapter";
import { scoreTrade } from "../scoring/tradeScoring";
import { getActiveRules } from "./ruleEngine";
import { getBankrollSummary } from "./bankroll";

export interface ScoreTradesSummary {
  scored: number;
  paperCopy: number;
  watchlist: number;
  skip: number;
  bankrollBlocked: number;
  marketDataUnavailable: number;
  errors: string[];
}

/**
 * Scores unscored ObservedTrades into DecisionJournal + PaperTrade rows.
 *
 * maxPerRun bounds how many trades a single invocation will process, so a
 * large backlog can't cause one run to take so long that the next cron tick
 * fires on top of it (see deploy/run-job.sh's flock for the other half of
 * this protection).
 *
 * Market quotes for the whole batch are fetched up front via
 * fetchMarketQuotesBatch (chunked ~25-at-a-time) instead of one HTTP call
 * per trade — the previous per-trade version could issue 300-600 rapid
 * individual requests scoring a single batch, which tripped Polymarket's
 * rate limit (HTTP 429) and caused most of the batch to fail.
 *
 * If a market genuinely can't be found even after the adapter's active+
 * closed retry, we write an explicit `skip` decision instead of leaving the
 * trade unscored forever — leaving it unscored means every future run
 * re-fetches it, re-fails, and never makes forward progress.
 */
export async function scoreUnscoredTrades(maxPerRun = 300): Promise<ScoreTradesSummary> {
  const rules = await getActiveRules();
  const bankroll = await getBankrollSummary();
  let availableCash = bankroll.availableCash;
  let openStake = bankroll.openStake;
  const maxExposure = bankroll.maxExposure;

  const unscored = await db.observedTrade.findMany({
    where: { decision: { is: null } },
    include: { wallet: true },
    orderBy: { timestamp: "asc" },
    take: maxPerRun,
  });

  const summary: ScoreTradesSummary = {
    scored: 0,
    paperCopy: 0,
    watchlist: 0,
    skip: 0,
    bankrollBlocked: 0,
    marketDataUnavailable: 0,
    errors: [],
  };

  if (unscored.length === 0) return summary;

  // One batched round of HTTP calls for every market needed by this whole
  // run, instead of one call per trade.
  const quotes = await fetchMarketQuotesBatch(unscored.map((ot) => ot.marketId));

  for (const ot of unscored) {
    const quoteResult = quotes.get(ot.marketId);

    if (!quoteResult || !quoteResult.ok) {
      const errorMsg = quoteResult ? quoteResult.error : `No quote returned for ${ot.marketId}`;
      summary.errors.push(`Market ${ot.marketId}: ${errorMsg}`);

      await db.decisionJournal.create({
        data: {
          observedTradeId: ot.id,
          walletAddress: ot.walletAddress,
          marketId: ot.marketId,
          decision: "skip",
          copyScore: 0,
          confidence: 0,
          reasonsJson: JSON.stringify([]),
          risksJson: JSON.stringify([`Market data unavailable: ${errorMsg}`]),
          walletQualityScore: 0,
          roiScore: 0,
          consistencyScore: 0,
          copyabilityScore: 0,
          categoryFitScore: 0,
          entryTimingScore: 0,
          spreadScore: 0,
          liquidityScore: 0,
          thesisScore: 0,
          simulatedPositionSize: null,
        },
      });
      summary.skip++;
      summary.marketDataUnavailable++;
      summary.scored++;
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

    // Bankroll + exposure gate: a paper_copy decision only actually opens a
    // position if there's simulated cash left AND doing so wouldn't push
    // total simultaneous stake above the exposure cap. Otherwise it's
    // downgraded to skip and logged as such.
    let finalDecision = scored.decision;
    let finalSize = scored.simulatedPositionSize;
    const reasons = [...scored.reasons];
    const risks = [...scored.risks];
    let bankrollBlocked = false;

    if (finalDecision === "paper_copy" && finalSize) {
      const wouldBeStake = openStake + finalSize;
      if (finalSize > availableCash) {
        bankrollBlocked = true;
        finalDecision = "skip";
        risks.push(`Insufficient paper bankroll: needed $${finalSize.toFixed(2)}, only $${availableCash.toFixed(2)} available.`);
        finalSize = null;
      } else if (wouldBeStake > maxExposure) {
        bankrollBlocked = true;
        finalDecision = "skip";
        risks.push(
          `Exceeds max exposure: opening $${finalSize.toFixed(2)} would bring total staked to $${wouldBeStake.toFixed(2)}, above the ${(bankroll.maxExposurePct * 100).toFixed(0)}% cap ($${maxExposure.toFixed(2)}).`
        );
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
      openStake += finalSize;
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
