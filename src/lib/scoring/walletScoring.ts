import type { WalletTrade } from "../adapters/types";
import type { Rules } from "../rules/defaultRules";

export interface WalletScoreInput {
  address: string;
  trades: WalletTrade[]; // last 30 days
  rules: Rules;
}

export interface WalletScoreResult {
  roi30d: number;
  consistencyScore: number;
  copyabilityScore: number;
  oneHitWonderPenalty: number;
  globalScore: number;
  bestCategory?: string;
  categoryStrengths: Record<string, number>;
  averageTradeSize: number;
  tradeCount30d: number;
  resolvedTradeCount30d: number;
  winRate30d: number;
  averageLiquidity: number;
  averageSpread: number;
  averageEntryTiming: number;
  status: "track" | "watch" | "ignore";
  copyabilityNotes: string;
  riskNotes: string;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function simulatedTradePnl(t: WalletTrade): number {
  // Approximate realized PnL for a resolved trade using entry price as cost basis.
  // Buying YES at p that resolves YES nets size*(1-p)/p; resolves NO nets -size.
  // This is a simplification (no fees, no partial fills) used purely for scoring,
  // not for real accounting.
  if (!t.resolved) return 0;
  const cost = t.size;
  if (t.won) {
    const p = Math.max(0.01, t.entryPrice);
    return cost * (1 - p) / p;
  }
  return -cost;
}

export function scoreWallet(input: WalletScoreInput): WalletScoreResult {
  const { trades, rules } = input;
  const tradeCount30d = trades.length;
  const resolved = trades.filter((t) => t.resolved);
  const resolvedTradeCount30d = resolved.length;
  const wins = resolved.filter((t) => t.won).length;
  const winRate30d = resolvedTradeCount30d > 0 ? wins / resolvedTradeCount30d : 0;

  const pnls = resolved.map(simulatedTradePnl);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const totalSize = trades.reduce((a, t) => a + t.size, 0) || 1;
  const roi30d = totalPnl / totalSize;

  // --- One-hit-wonder penalty ---
  // If a single trade accounts for an outsized share of total profit, the
  // wallet's edge may just be luck, not a repeatable strategy.
  let oneHitWonderPenalty = 0;
  const positivePnls = pnls.filter((p) => p > 0);
  const totalPositive = positivePnls.reduce((a, b) => a + b, 0);
  if (totalPositive > 0) {
    const maxSingle = Math.max(...positivePnls, 0);
    const share = maxSingle / totalPositive;
    if (share > rules.oneHitWonderShareThreshold) {
      oneHitWonderPenalty = clamp01((share - rules.oneHitWonderShareThreshold) / (1 - rules.oneHitWonderShareThreshold)) * rules.oneHitWonderPenaltyWeight;
    }
  }

  // --- Consistency: how stable are per-trade returns? ---
  // Lower variance in per-trade ROI (normalized by size) = more consistent.
  const perTradeRoi = resolved.map((t, i) => (t.size > 0 ? pnls[i] / t.size : 0));
  let consistencyScore = 0.5;
  if (perTradeRoi.length >= 3) {
    const mean = perTradeRoi.reduce((a, b) => a + b, 0) / perTradeRoi.length;
    const variance = perTradeRoi.reduce((a, b) => a + (b - mean) ** 2, 0) / perTradeRoi.length;
    const stdev = Math.sqrt(variance);
    // Map stdev into a 0-1 "consistency" score: lower stdev -> higher score.
    consistencyScore = clamp01(1 - stdev / 1.5);
  }

  // --- Category strengths ---
  const categoryStrengths: Record<string, number> = {};
  const byCategory: Record<string, WalletTrade[]> = {};
  for (const t of trades) {
    const cat = t.marketCategory || "Uncategorized";
    (byCategory[cat] ||= []).push(t);
  }
  for (const [cat, catTrades] of Object.entries(byCategory)) {
    const catResolved = catTrades.filter((t) => t.resolved);
    const catWins = catResolved.filter((t) => t.won).length;
    categoryStrengths[cat] = catResolved.length > 0 ? catWins / catResolved.length : 0.5;
  }
  const bestCategory = Object.entries(categoryStrengths).sort((a, b) => b[1] - a[1])[0]?.[0];

  // --- Copyability: can the bot realistically follow this wallet's entries? ---
  // Approximated here from trade frequency and average size — a wallet that
  // trades constantly in huge illiquid size is hard to copy. Real spread/
  // liquidity numbers are folded in by the trade-scoring step per-trade;
  // this wallet-level figure is a coarse average signal.
  const averageTradeSize = totalSize / Math.max(1, tradeCount30d);
  const sizeFactor = clamp01(1 - averageTradeSize / 5000);
  const frequencyFactor = clamp01(tradeCount30d / 60);
  const copyabilityScore = clamp01(0.6 * sizeFactor + 0.4 * frequencyFactor);

  // Placeholder liquidity/spread/timing aggregates — refined further once
  // per-trade market snapshots are collected by the trade monitor.
  const averageLiquidity = 0;
  const averageSpread = 0;
  const averageEntryTiming = 0.5;

  const roiScore = clamp01(0.5 + roi30d); // roi30d is a fraction; center at 0.5
  const w = rules.weights;
  let globalScore =
    w.roi * roiScore +
    w.consistency * consistencyScore +
    w.copyability * copyabilityScore +
    w.categoryEdge * clamp01(categoryStrengths[bestCategory || ""] ?? 0.5) +
    w.liquidityQuality * 0.5 + // neutral until real liquidity data is folded in
    w.entryTiming * averageEntryTiming +
    w.tradeFrequency * frequencyFactor +
    w.resolvedPerformance * clamp01(winRate30d);

  globalScore = clamp01(globalScore - oneHitWonderPenalty);

  let status: "track" | "watch" | "ignore" = "ignore";
  const notEnoughData = resolvedTradeCount30d < rules.minResolvedTrades;
  if (!notEnoughData && globalScore >= rules.minGlobalScoreForTrack && consistencyScore >= rules.minConsistencyScore) {
    status = "track";
  } else if (globalScore >= rules.watchGlobalScoreFloor) {
    status = "watch";
  } else {
    status = "ignore";
  }

  const riskNotes: string[] = [];
  if (oneHitWonderPenalty > 0) riskNotes.push("Profit is concentrated in one standout trade — may be luck, not edge.");
  if (notEnoughData) riskNotes.push(`Only ${resolvedTradeCount30d} resolved trades in 30 days — not enough evidence yet.`);
  if (consistencyScore < rules.minConsistencyScore) riskNotes.push("Per-trade returns are volatile/inconsistent.");

  const copyabilityNotes: string[] = [];
  if (averageTradeSize > 3000) copyabilityNotes.push("Average position size is large; may be hard to size-match.");
  if (tradeCount30d < 5) copyabilityNotes.push("Low trade frequency — limited copy opportunities.");

  return {
    roi30d,
    consistencyScore,
    copyabilityScore,
    oneHitWonderPenalty,
    globalScore,
    bestCategory,
    categoryStrengths,
    averageTradeSize,
    tradeCount30d,
    resolvedTradeCount30d,
    winRate30d,
    averageLiquidity,
    averageSpread,
    averageEntryTiming,
    status,
    copyabilityNotes: copyabilityNotes.join(" ") || "No copyability concerns detected.",
    riskNotes: riskNotes.join(" ") || "No major risk flags.",
  };
}
