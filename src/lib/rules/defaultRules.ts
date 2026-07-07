// Default RuleSet v1. This is the starting configuration for wallet scoring,
// trade scoring, and paper position sizing. The rule engine (see
// src/lib/engine/ruleEngine.ts) mutates a copy of this shape over time and
// stores every version + the reasoning for each change in RuleSet/RuleChange.

export interface Rules {
  version: number;
  // Wallet scoring thresholds
  minResolvedTrades: number; // below this, not enough evidence to trust the wallet
  oneHitWonderShareThreshold: number; // if one trade > this % of total profit, penalize
  oneHitWonderPenaltyWeight: number;
  minConsistencyScore: number; // 0-1
  maxAverageSpreadForTrack: number;
  minAverageLiquidityForTrack: number;
  minGlobalScoreForTrack: number;
  watchGlobalScoreFloor: number;

  // Trade scoring thresholds
  maxAllowedPriceMovementSinceEntry: number; // fraction, e.g. 0.08 = 8 cents
  maxAllowedSpreadForCopy: number;
  minLiquidityForCopy: number;
  minTimeToResolutionSeconds: number; // avoid copying trades about to resolve
  minCopyScoreForPaperCopy: number;
  minCopyScoreForWatchlist: number;

  // Position sizing
  minPositionSize: number;
  maxPositionSize: number;
  highConfidenceThreshold: number; // confidence above this uses maxPositionSize

  // Weights used when combining sub-scores into the wallet global score
  weights: {
    roi: number;
    consistency: number;
    copyability: number;
    categoryEdge: number;
    liquidityQuality: number;
    entryTiming: number;
    tradeFrequency: number;
    resolvedPerformance: number;
  };
}

export const DEFAULT_RULES: Rules = {
  version: 1,
  minResolvedTrades: 8,
  oneHitWonderShareThreshold: 0.6,
  oneHitWonderPenaltyWeight: 0.5,
  minConsistencyScore: 0.35,
  maxAverageSpreadForTrack: 0.04,
  minAverageLiquidityForTrack: 1500,
  minGlobalScoreForTrack: 0.62,
  watchGlobalScoreFloor: 0.4,

  maxAllowedPriceMovementSinceEntry: 0.08,
  maxAllowedSpreadForCopy: 0.05,
  minLiquidityForCopy: 1000,
  minTimeToResolutionSeconds: 3600,
  minCopyScoreForPaperCopy: 0.65,
  minCopyScoreForWatchlist: 0.45,

  minPositionSize: 5,
  maxPositionSize: 20,
  highConfidenceThreshold: 0.8,

  weights: {
    roi: 0.22,
    consistency: 0.18,
    copyability: 0.16,
    categoryEdge: 0.1,
    liquidityQuality: 0.12,
    entryTiming: 0.12,
    tradeFrequency: 0.05,
    resolvedPerformance: 0.05,
  },
};
