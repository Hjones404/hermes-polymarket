// Shared adapter types.
//
// Design rule (per SAFETY.md / build spec): an adapter call either returns
// real data fetched from a live API ("live"), or returns clearly-labeled
// demo data ("demo") when DATA_SOURCE_MODE=demo. It never silently swaps in
// demo data and calls it live, and it never invents numbers to paper over a
// failed call. A failed live call returns ok:false with the real error and
// the caller must surface that error and stop, not fabricate a result.

export type AdapterResult<T> =
  | { ok: true; source: "live" | "demo"; data: T }
  | { ok: false; source: "live" | "demo"; error: string };

export interface LeaderboardEntry {
  address: string;
  label?: string;
  rank: number;
  pnl: number;
  volume: number;
}

export interface WalletTrade {
  walletAddress: string;
  marketId: string;
  conditionId?: string;
  marketQuestion: string;
  marketCategory?: string;
  outcome: string;
  side: "buy" | "sell";
  entryPrice: number;
  size: number;
  timestamp: string; // ISO
  resolved?: boolean;
  won?: boolean;
}

export interface MarketQuote {
  marketId: string;
  conditionId?: string;
  question: string;
  category?: string;
  yesPrice: number;
  noPrice: number;
  bestBid?: number;
  bestAsk?: number;
  liquidity?: number;
  volume?: number;
  secondsToResolution?: number;
}

export function dataSourceMode(): "live" | "demo" {
  const mode = (process.env.DATA_SOURCE_MODE || "live").toLowerCase();
  return mode === "demo" ? "demo" : "live";
}
