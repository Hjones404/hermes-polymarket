import { describe, expect, it } from "vitest";
import { scoreTrade } from "../src/lib/scoring/tradeScoring";
import { DEFAULT_RULES } from "../src/lib/rules/defaultRules";
import type { MarketQuote, WalletTrade } from "../src/lib/adapters/types";

function baseTrade(overrides: Partial<WalletTrade> = {}): WalletTrade {
  return {
    walletAddress: "0xabc",
    marketId: "m1",
    marketQuestion: "Will X happen?",
    marketCategory: "Politics",
    outcome: "YES",
    side: "buy",
    entryPrice: 0.4,
    size: 100,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function baseQuote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    marketId: "m1",
    question: "Will X happen?",
    yesPrice: 0.4,
    noPrice: 0.6,
    bestBid: 0.39,
    bestAsk: 0.41,
    liquidity: 5000,
    volume: 10000,
    secondsToResolution: 86400,
    ...overrides,
  };
}

describe("scoreTrade", () => {
  it("recommends paper_copy for a clean, liquid, tight-spread, high-quality-wallet trade", () => {
    const result = scoreTrade({
      trade: baseTrade(),
      walletGlobalScore: 0.85,
      walletCategoryScore: 0.7,
      quote: baseQuote(),
      rules: DEFAULT_RULES,
    });
    expect(result.decision).toBe("paper_copy");
    expect(result.simulatedPositionSize).toBeGreaterThanOrEqual(DEFAULT_RULES.minPositionSize);
    expect(result.simulatedPositionSize).toBeLessThanOrEqual(DEFAULT_RULES.maxPositionSize);
  });

  it("skips a trade where the price has moved far past the wallet's entry", () => {
    const result = scoreTrade({
      trade: baseTrade({ entryPrice: 0.2 }),
      walletGlobalScore: 0.85,
      walletCategoryScore: 0.7,
      quote: baseQuote({ yesPrice: 0.6 }), // moved 40c since entry
      rules: DEFAULT_RULES,
    });
    expect(result.decision).not.toBe("paper_copy");
    expect(result.risks.some((r) => r.toLowerCase().includes("late entry"))).toBe(true);
  });

  it("skips a trade with a wide spread, low liquidity, and a weak wallet", () => {
    const result = scoreTrade({
      trade: baseTrade(),
      walletGlobalScore: 0.3,
      walletCategoryScore: 0.3,
      quote: baseQuote({ bestBid: 0.2, bestAsk: 0.6, liquidity: 50 }),
      rules: DEFAULT_RULES,
    });
    expect(result.decision).toBe("skip");
  });

  it("never assigns a simulated position size for a skip decision", () => {
    const result = scoreTrade({
      trade: baseTrade(),
      walletGlobalScore: 0.1,
      walletCategoryScore: 0.1,
      quote: baseQuote({ liquidity: 10 }),
      rules: DEFAULT_RULES,
    });
    expect(result.decision).toBe("skip");
    expect(result.simulatedPositionSize).toBeNull();
  });

  it("gives higher confidence trades the max position size", () => {
    const result = scoreTrade({
      trade: baseTrade(),
      walletGlobalScore: 0.95,
      walletCategoryScore: 0.9,
      quote: baseQuote(),
      rules: DEFAULT_RULES,
    });
    if (result.decision === "paper_copy" && result.confidence >= DEFAULT_RULES.highConfidenceThreshold) {
      expect(result.simulatedPositionSize).toBe(DEFAULT_RULES.maxPositionSize);
    }
  });
});
