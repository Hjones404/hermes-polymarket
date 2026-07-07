import type { MarketQuote, WalletTrade } from "../adapters/types";
import type { Rules } from "../rules/defaultRules";

export interface TradeScoreInput {
  trade: WalletTrade;
  walletGlobalScore: number;
  walletCategoryScore: number; // wallet's win rate in this trade's category
  quote: MarketQuote;
  rules: Rules;
}

export type Decision = "paper_copy" | "watchlist" | "skip";

export interface TradeScoreResult {
  decision: Decision;
  copyScore: number;
  confidence: number;
  simulatedPositionSize: number | null;
  reasons: string[];
  risks: string[];
  breakdown: {
    walletQualityScore: number;
    roiScore: number;
    consistencyScore: number;
    copyabilityScore: number;
    categoryFitScore: number;
    entryTimingScore: number;
    spreadScore: number;
    liquidityScore: number;
    thesisScore: number;
  };
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function scoreTrade(input: TradeScoreInput): TradeScoreResult {
  const { trade, walletGlobalScore, walletCategoryScore, quote, rules } = input;
  const reasons: string[] = [];
  const risks: string[] = [];

  const currentPrice = trade.outcome === "YES" ? quote.yesPrice : quote.noPrice;
  const priceMovement = Math.abs(currentPrice - trade.entryPrice);
  const spread = quote.bestAsk !== undefined && quote.bestBid !== undefined ? quote.bestAsk - quote.bestBid : 0.02;
  const liquidity = quote.liquidity ?? 0;
  const secondsToResolution = quote.secondsToResolution ?? 999999;

  const entryTimingScore = clamp01(1 - priceMovement / Math.max(0.0001, rules.maxAllowedPriceMovementSinceEntry * 2));
  const spreadScore = clamp01(1 - spread / Math.max(0.0001, rules.maxAllowedSpreadForCopy * 2));
  const liquidityScore = clamp01(liquidity / Math.max(1, rules.minLiquidityForCopy * 3));
  const thesisScore = clamp01(0.5 + (currentPrice - 0.5) * 0 + (walletCategoryScore - 0.5)); // category-informed thesis proxy

  if (priceMovement > rules.maxAllowedPriceMovementSinceEntry) {
    risks.push(`Price has moved ${(priceMovement * 100).toFixed(1)}c since wallet entry — late entry risk.`);
  } else {
    reasons.push("Price is still close to the wallet's entry.");
  }

  if (spread > rules.maxAllowedSpreadForCopy) {
    risks.push(`Spread of ${(spread * 100).toFixed(1)}c is wide — fill quality risk.`);
  } else {
    reasons.push("Spread is tight enough to realistically fill.");
  }

  if (liquidity < rules.minLiquidityForCopy) {
    risks.push(`Liquidity (~$${Math.round(liquidity)}) is below the copy threshold.`);
  } else {
    reasons.push("Liquidity looks sufficient for a small paper position.");
  }

  if (secondsToResolution < rules.minTimeToResolutionSeconds) {
    risks.push("Market resolves very soon — limited time for the thesis to play out.");
  }

  if (walletCategoryScore >= 0.6) {
    reasons.push(`Wallet has a strong track record in ${trade.marketCategory || "this category"}.`);
  } else if (walletCategoryScore < 0.45) {
    risks.push(`Wallet's history in ${trade.marketCategory || "this category"} is weak or unproven.`);
  }

  const walletQualityScore = walletGlobalScore;
  const roiScore = walletGlobalScore; // wallet-level ROI already folded into global score
  const consistencyScore = walletGlobalScore; // same — kept as separate field for journal transparency
  const copyabilityScore = clamp01((spreadScore + liquidityScore) / 2);
  const categoryFitScore = clamp01(walletCategoryScore);

  const copyScore = clamp01(
    0.28 * walletQualityScore +
      0.18 * categoryFitScore +
      0.18 * entryTimingScore +
      0.14 * spreadScore +
      0.14 * liquidityScore +
      0.08 * thesisScore
  );

  const confidence = clamp01(copyScore * 0.7 + walletQualityScore * 0.3);

  let decision: Decision = "skip";
  if (
    copyScore >= rules.minCopyScoreForPaperCopy &&
    priceMovement <= rules.maxAllowedPriceMovementSinceEntry &&
    spread <= rules.maxAllowedSpreadForCopy &&
    liquidity >= rules.minLiquidityForCopy &&
    secondsToResolution >= rules.minTimeToResolutionSeconds
  ) {
    decision = "paper_copy";
  } else if (copyScore >= rules.minCopyScoreForWatchlist) {
    decision = "watchlist";
  } else {
    decision = "skip";
    if (risks.length === 0) risks.push("Overall copy score too low given current rule thresholds.");
  }

  let simulatedPositionSize: number | null = null;
  if (decision === "paper_copy") {
    simulatedPositionSize =
      confidence >= rules.highConfidenceThreshold
        ? rules.maxPositionSize
        : rules.minPositionSize + (rules.maxPositionSize - rules.minPositionSize) * confidence;
    simulatedPositionSize = Math.round(simulatedPositionSize * 100) / 100;
  }

  return {
    decision,
    copyScore,
    confidence,
    simulatedPositionSize,
    reasons,
    risks,
    breakdown: {
      walletQualityScore,
      roiScore,
      consistencyScore,
      copyabilityScore,
      categoryFitScore,
      entryTimingScore,
      spreadScore,
      liquidityScore,
      thesisScore,
    },
  };
}
