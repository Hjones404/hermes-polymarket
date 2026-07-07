import { db } from "../db";
import { applyRuleChange, getActiveRules } from "./ruleEngine";
import type { Rules } from "../rules/defaultRules";

export interface RuleUpdateSummary {
  changesMade: number;
  details: string[];
}

/**
 * Looks at recent OutcomeReviews (joined back to the DecisionJournal that
 * produced each paper trade) and nudges rule thresholds when there's a
 * clear pattern. This runs without asking for approval (per spec), but
 * every change is recorded via applyRuleChange with the reasoning and
 * evidence attached — nothing here mutates rules silently.
 */
export async function autoUpdateRules(): Promise<RuleUpdateSummary> {
  const rules = await getActiveRules();
  const summary: RuleUpdateSummary = { changesMade: 0, details: [] };

  const reviews = await db.outcomeReview.findMany({
    where: { wasDecisionGood: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      decision: { include: { observedTrade: true } },
    },
  });

  if (reviews.length < 10) {
    summary.details.push(`Only ${reviews.length} reviewed outcomes so far — waiting for at least 10 before touching rules.`);
    return summary;
  }

  // --- Spread-heavy trades underperforming? ---
  const highSpreadReviews = reviews.filter((r: any) => r.decision.spreadScore < 0.5);
  if (highSpreadReviews.length >= 5) {
    const goodRate = highSpreadReviews.filter((r: any) => r.wasDecisionGood).length / highSpreadReviews.length;
    if (goodRate < 0.4) {
      const before = rules.maxAllowedSpreadForCopy;
      const after = Math.max(0.01, Number((before * 0.85).toFixed(4)));
      await applyRuleChange({
        reason: "Trades copied with a wide spread are underperforming — tightening the max allowed spread.",
        evidenceSummary: `${highSpreadReviews.length} recent high-spread trades had only a ${(goodRate * 100).toFixed(0)}% good-decision rate.`,
        mutate: (r: Rules) => ({ ...r, maxAllowedSpreadForCopy: after }),
      });
      summary.changesMade++;
      summary.details.push(`Lowered maxAllowedSpreadForCopy from ${before} to ${after}.`);
    }
  }

  // --- Low-liquidity trades underperforming? ---
  const lowLiqReviews = reviews.filter((r: any) => r.decision.liquidityScore < 0.5);
  if (lowLiqReviews.length >= 5) {
    const goodRate = lowLiqReviews.filter((r: any) => r.wasDecisionGood).length / lowLiqReviews.length;
    if (goodRate < 0.4) {
      const before = rules.minLiquidityForCopy;
      const after = Math.round(before * 1.2);
      await applyRuleChange({
        reason: "Low-liquidity trades are underperforming — raising the minimum liquidity required to copy.",
        evidenceSummary: `${lowLiqReviews.length} recent low-liquidity trades had only a ${(goodRate * 100).toFixed(0)}% good-decision rate.`,
        mutate: (r: Rules) => ({ ...r, minLiquidityForCopy: after }),
      });
      summary.changesMade++;
      summary.details.push(`Raised minLiquidityForCopy from ${before} to ${after}.`);
    }
  }

  // --- Late entries (large price movement since wallet entry) losing? ---
  const lateEntryReviews = reviews.filter((r: any) => r.decision.entryTimingScore < 0.5);
  if (lateEntryReviews.length >= 5) {
    const goodRate = lateEntryReviews.filter((r: any) => r.wasDecisionGood).length / lateEntryReviews.length;
    if (goodRate < 0.4) {
      const before = rules.maxAllowedPriceMovementSinceEntry;
      const after = Math.max(0.01, Number((before * 0.8).toFixed(4)));
      await applyRuleChange({
        reason: "Late-entry copies (large price movement since the wallet's own entry) are losing more often than not.",
        evidenceSummary: `${lateEntryReviews.length} recent late-entry trades had only a ${(goodRate * 100).toFixed(0)}% good-decision rate.`,
        mutate: (r: Rules) => ({ ...r, maxAllowedPriceMovementSinceEntry: after }),
      });
      summary.changesMade++;
      summary.details.push(`Reduced maxAllowedPriceMovementSinceEntry from ${before} to ${after}.`);
    }
  }

  // --- Downgrade wallets with poor recent paper performance ---
  const walletOutcomes: Record<string, { good: number; total: number }> = {};
  for (const r of reviews) {
    const addr = r.decision.walletAddress;
    walletOutcomes[addr] ||= { good: 0, total: 0 };
    walletOutcomes[addr].total++;
    if (r.wasDecisionGood) walletOutcomes[addr].good++;
  }
  for (const [address, stats] of Object.entries(walletOutcomes)) {
    if (stats.total >= 5 && stats.good / stats.total < 0.3) {
      const wallet = await db.walletProfile.findUnique({ where: { address } });
      if (wallet && wallet.status !== "ignore") {
        await db.walletProfile.update({ where: { address }, data: { status: "watch" } });
        summary.details.push(`Downgraded wallet ${address} to "watch" after ${stats.good}/${stats.total} good paper decisions.`);
      }
    }
  }

  if (summary.changesMade === 0 && summary.details.length === 0) {
    summary.details.push("Reviewed recent outcomes — no threshold changes were warranted this run.");
  }

  return summary;
}
