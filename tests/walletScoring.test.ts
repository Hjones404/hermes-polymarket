import { describe, expect, it } from "vitest";
import { scoreWallet } from "../src/lib/scoring/walletScoring";
import { DEFAULT_RULES } from "../src/lib/rules/defaultRules";
import type { WalletTrade } from "../src/lib/adapters/types";

function makeTrade(overrides: Partial<WalletTrade> = {}): WalletTrade {
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
    resolved: true,
    won: true,
    ...overrides,
  };
}

describe("scoreWallet", () => {
  it("penalizes a wallet whose profit is dominated by a single lucky trade", () => {
    const trades: WalletTrade[] = [
      makeTrade({ marketId: "big-win", entryPrice: 0.05, size: 100, resolved: true, won: true }), // huge payout
      ...Array.from({ length: 9 }).map((_, i) =>
        makeTrade({ marketId: `m${i}`, entryPrice: 0.5, size: 50, resolved: true, won: i % 2 === 0 })
      ),
    ];

    const result = scoreWallet({ address: "0xabc", trades, rules: DEFAULT_RULES });
    expect(result.oneHitWonderPenalty).toBeGreaterThan(0);
  });

  it("does not penalize a wallet with evenly distributed wins", () => {
    const trades: WalletTrade[] = Array.from({ length: 10 }).map((_, i) =>
      makeTrade({ marketId: `m${i}`, entryPrice: 0.5, size: 100, resolved: true, won: true })
    );

    const result = scoreWallet({ address: "0xabc", trades, rules: DEFAULT_RULES });
    expect(result.oneHitWonderPenalty).toBe(0);
  });

  it("marks a wallet with too few resolved trades as not track-worthy", () => {
    const trades: WalletTrade[] = Array.from({ length: 3 }).map((_, i) =>
      makeTrade({ marketId: `m${i}`, resolved: true, won: true })
    );

    const result = scoreWallet({ address: "0xabc", trades, rules: DEFAULT_RULES });
    expect(result.status).not.toBe("track");
  });

  it("flags low copyability for a wallet with very large average trade sizes", () => {
    const trades: WalletTrade[] = Array.from({ length: 10 }).map((_, i) =>
      makeTrade({ marketId: `m${i}`, size: 20000, resolved: true, won: i % 2 === 0 })
    );

    const result = scoreWallet({ address: "0xabc", trades, rules: DEFAULT_RULES });
    expect(result.copyabilityScore).toBeLessThan(0.5);
  });

  it("computes a win rate matching resolved trade outcomes", () => {
    const trades: WalletTrade[] = [
      makeTrade({ marketId: "a", resolved: true, won: true }),
      makeTrade({ marketId: "b", resolved: true, won: true }),
      makeTrade({ marketId: "c", resolved: true, won: false }),
      makeTrade({ marketId: "d", resolved: true, won: false }),
    ];
    const result = scoreWallet({ address: "0xabc", trades, rules: DEFAULT_RULES });
    expect(result.winRate30d).toBeCloseTo(0.5, 5);
    expect(result.resolvedTradeCount30d).toBe(4);
  });
});
