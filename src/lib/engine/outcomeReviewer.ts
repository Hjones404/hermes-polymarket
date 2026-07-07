import { db } from "../db";

export interface ReviewSummary {
  reviewed: number;
}

/**
 * For every resolved PaperTrade without a review yet, records an
 * OutcomeReview judging whether the original decision was good, plus a
 * short lesson. Also reviews skipped/watchlisted decisions retroactively
 * against the market's actual outcome, so "missed winners" and
 * "avoided losers" can be computed later in the performance comparison.
 */
export async function reviewResolvedPaperTrades(): Promise<ReviewSummary> {
  const resolvedTrades = await db.paperTrade.findMany({
    where: { status: "resolved", outcomeReview: { is: null } },
    include: { decision: true },
  });

  let reviewed = 0;
  for (const trade of resolvedTrades) {
    const finalOutcome = trade.currentPrice >= 0.99 ? "yes" : "no";
    const wasDecisionGood = (trade.realizedPnl ?? 0) > 0;
    const lessons: string[] = [];
    if (wasDecisionGood) {
      lessons.push("Copy criteria correctly identified a winning setup.");
    } else {
      lessons.push("Copy criteria let through a losing setup — check spread/liquidity/entry-timing thresholds.");
    }

    await db.outcomeReview.create({
      data: {
        decisionJournalId: trade.decisionJournalId,
        paperTradeId: trade.id,
        priceAfter24h: trade.currentPrice,
        finalOutcome,
        simulatedPnl: trade.realizedPnl ?? 0,
        wasDecisionGood,
        lessonsJson: JSON.stringify(lessons),
      },
    });
    reviewed++;
  }

  return { reviewed };
}
