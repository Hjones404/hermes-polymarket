// Polymarket adapter layer.
//
// Endpoints verified against https://docs.polymarket.com (July 2026).
//   - GET https://data-api.polymarket.com/v1/leaderboard  (max 50 per page,
//     paginated via offset up to 1000 — NOT a single limit=500 call)
//   - GET https://data-api.polymarket.com/trades           (per-user trade
//     history — does NOT include category/resolved/won; those are derived
//     below via a Gamma market lookup keyed on conditionId)
//   - GET https://gamma-api.polymarket.com/markets?condition_ids=...  (market
//     metadata, prices, liquidity, close status). Gamma's default listing
//     appears to favor currently-active markets, so a conditionId that
//     comes back empty is retried once with &closed=true before being
//     treated as a genuine miss.
//   - GET https://clob.polymarket.com/book?token_id=...     (order book,
//     read-only, used only for the optional spread helper — not on the
//     critical path of scoring)
//
// Rate limiting: Gamma will return HTTP 429 if hit too fast/too often.
// safeFetchJson retries 429s with backoff (honoring Retry-After when Gamma
// sends one). More importantly, market lookups for a whole batch of trades
// should always go through fetchMarketQuotesBatch (chunks of ~25 markets
// per HTTP call) rather than calling fetchMarketQuote in a per-trade loop —
// the latter is what caused the 429 storm in the first place (300 trades
// scored one-by-one meant 300-600 individual requests in quick succession).
//
// Behavior contract (do not weaken this):
//   - DATA_SOURCE_MODE=live (default): call the real endpoint. On success,
//     return { ok: true, source: "live", data }. On failure, return
//     { ok: false, source: "live", error: <real error message> }. We do NOT
//     fall back to demo data here — the build spec says to surface the real
//     error and stop, not fake live data.
//   - DATA_SOURCE_MODE=demo: skip the network call entirely and return
//     demo data tagged source: "demo".
//
// No wallet keys, signing, or order placement exist anywhere in this file
// or this project. Everything here is read-only market/leaderboard data.

import { dataSourceMode, type AdapterResult, type LeaderboardEntry, type MarketQuote, type WalletTrade } from "./types";
import { demoLeaderboard, demoMarketQuote, demoWalletTrades } from "./demoData";

const GAMMA_API = process.env.POLYMARKET_GAMMA_API || "https://gamma-api.polymarket.com";
const DATA_API = process.env.POLYMARKET_DATA_API || "https://data-api.polymarket.com";
const CLOB_API = process.env.POLYMARKET_CLOB_API || "https://clob.polymarket.com";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeFetchJson(url: string, retriesLeft = 2): Promise<{ json?: any; error?: string }> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 429 && retriesLeft > 0) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const backoffMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 1000 * (3 - retriesLeft) ** 2; // 1s, then 4s
      await sleep(backoffMs);
      return safeFetchJson(url, retriesLeft - 1);
    }
    if (!res.ok) {
      return { error: `HTTP ${res.status} ${res.statusText} from ${url}` };
    }
    const json = await res.json();
    return { json };
  } catch (err: any) {
    return { error: `Network/parse error calling ${url}: ${err?.message || String(err)}` };
  }
}

// --- Leaderboard -----------------------------------------------------------
export async function fetchLeaderboard(count = 500): Promise<AdapterResult<LeaderboardEntry[]>> {
  if (dataSourceMode() === "demo") {
    return { ok: true, source: "demo", data: demoLeaderboard(count) };
  }

  const PAGE_SIZE = 50;
  const MAX_OFFSET = 1000;
  const entries: LeaderboardEntry[] = [];

  for (let offset = 0; offset < count && offset <= MAX_OFFSET; offset += PAGE_SIZE) {
    const url = `${DATA_API}/v1/leaderboard?category=OVERALL&timePeriod=MONTH&orderBy=PNL&limit=${PAGE_SIZE}&offset=${offset}`;
    const { json, error } = await safeFetchJson(url);
    if (error) {
      return { ok: false, source: "live", error };
    }
    if (!Array.isArray(json) || json.length === 0) break;

    try {
      for (const row of json) {
        entries.push({
          address: row.proxyWallet,
          label: row.userName || undefined,
          rank: Number(row.rank),
          pnl: Number(row.pnl ?? 0),
          volume: Number(row.vol ?? 0),
        });
      }
    } catch (err: any) {
      return { ok: false, source: "live", error: `Failed to parse leaderboard response: ${err?.message}` };
    }

    if (json.length < PAGE_SIZE) break; // last page
  }

  return { ok: true, source: "live", data: entries.slice(0, count) };
}

// --- Market metadata lookup (internal helper) -------------------------------
interface GammaMarketSummary {
  conditionId: string;
  question: string;
  category?: string;
  closed: boolean;
  outcomes: string[]; // e.g. ["Yes", "No"]
  outcomePrices: number[]; // parallel array, final settled price if closed
  bestBid?: number;
  bestAsk?: number;
  liquidityNum?: number;
  volumeNum?: number;
  endDate?: string;
}

function parseGammaMarket(row: any): GammaMarketSummary {
  let outcomes: string[] = [];
  let outcomePrices: number[] = [];
  try {
    outcomes = JSON.parse(row.outcomes ?? "[]");
  } catch {
    outcomes = [];
  }
  try {
    outcomePrices = (JSON.parse(row.outcomePrices ?? "[]") as string[]).map(Number);
  } catch {
    outcomePrices = [];
  }
  return {
    conditionId: row.conditionId,
    question: row.question || "Unknown market",
    category: row.category || row.tags?.[0]?.label,
    closed: Boolean(row.closed),
    outcomes,
    outcomePrices,
    bestBid: row.bestBid !== undefined && row.bestBid !== null ? Number(row.bestBid) : undefined,
    bestAsk: row.bestAsk !== undefined && row.bestAsk !== null ? Number(row.bestAsk) : undefined,
    liquidityNum: row.liquidityNum !== undefined && row.liquidityNum !== null ? Number(row.liquidityNum) : undefined,
    volumeNum: row.volumeNum !== undefined && row.volumeNum !== null ? Number(row.volumeNum) : undefined,
    endDate: row.endDate || row.endDateIso,
  };
}

// Looks up a batch of condition IDs against Gamma, chunked to ~25 IDs per
// HTTP call with a small delay between chunks to avoid tripping rate
// limits. Tries the default (active-market-favoring) query first; for any
// conditionId that comes back empty, retries once with &closed=true, since
// a market that's already resolved by the time we check it is completely
// normal, not an error.
//
// THIS is the function that should be used whenever you need quotes for
// more than one market — e.g. scoring a batch of trades. Calling
// fetchMarketQuote in a per-item loop instead is what caused the 429 storm
// this replaces (300 trades = up to 600 individual requests vs. ~24 here).
async function fetchGammaMarketsByConditionIds(conditionIds: string[]): Promise<Map<string, GammaMarketSummary>> {
  const map = new Map<string, GammaMarketSummary>();
  const unique = Array.from(new Set(conditionIds)).filter(Boolean);
  const CHUNK = 25;
  const DELAY_BETWEEN_CHUNKS_MS = 500;

  async function queryChunk(chunk: string[], extraParams: string): Promise<any[]> {
    const params = chunk.map((id) => `condition_ids=${encodeURIComponent(id)}`).join("&");
    const { json } = await safeFetchJson(`${GAMMA_API}/markets?${params}${extraParams}&limit=${chunk.length}`);
    return Array.isArray(json) ? json : [];
  }

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);

    const activeRows = await queryChunk(chunk, "");
    for (const row of activeRows) {
      try {
        map.set(row.conditionId, parseGammaMarket(row));
      } catch {
        /* skip unparseable row */
      }
    }

    const stillMissing = chunk.filter((id) => !map.has(id));
    if (stillMissing.length > 0) {
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
      const closedRows = await queryChunk(stillMissing, "&closed=true");
      for (const row of closedRows) {
        try {
          map.set(row.conditionId, parseGammaMarket(row));
        } catch {
          /* skip unparseable row */
        }
      }
    }

    if (i + CHUNK < unique.length) {
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }
  }
  return map;
}

function gammaMarketToQuote(marketId: string, market: GammaMarketSummary): MarketQuote {
  const yesIdx = market.outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const yesPrice = yesIdx >= 0 ? market.outcomePrices[yesIdx] : market.outcomePrices[0] ?? 0.5;
  return {
    marketId,
    conditionId: market.conditionId,
    question: market.question,
    category: market.category,
    yesPrice,
    noPrice: Number((1 - yesPrice).toFixed(4)),
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    liquidity: market.liquidityNum,
    volume: market.volumeNum,
    secondsToResolution: market.endDate
      ? Math.max(0, Math.floor((new Date(market.endDate).getTime() - Date.now()) / 1000))
      : undefined,
  };
}

// --- Wallet trade history ----------------------------------------------------
export async function fetchWalletTrades(address: string, lookbackDays = 30): Promise<AdapterResult<WalletTrade[]>> {
  if (dataSourceMode() === "demo") {
    return { ok: true, source: "demo", data: demoWalletTrades(address) };
  }

  const { json, error } = await safeFetchJson(`${DATA_API}/trades?user=${address}&limit=500&takerOnly=true`);
  if (error) {
    return { ok: false, source: "live", error };
  }
  if (!Array.isArray(json)) {
    return { ok: false, source: "live", error: "Unexpected trades response shape (expected an array)." };
  }

  try {
    const cutoff = Date.now() - lookbackDays * 86400000;
    const rawTrades = json.filter((t: any) => Number(t.timestamp) * 1000 >= cutoff);
    const marketMap = await fetchGammaMarketsByConditionIds(rawTrades.map((t: any) => t.conditionId));

    const trades: WalletTrade[] = rawTrades.map((t: any) => {
      const market = marketMap.get(t.conditionId);
      let resolved = false;
      let won: boolean | undefined;
      if (market?.closed) {
        resolved = true;
        const idx = market.outcomes.findIndex((o) => o.toLowerCase() === String(t.outcome).toLowerCase());
        const finalPrice = idx >= 0 ? market.outcomePrices[idx] : undefined;
        if (finalPrice !== undefined) won = finalPrice > 0.5;
      }
      return {
        walletAddress: address,
        marketId: t.conditionId,
        conditionId: t.conditionId,
        marketQuestion: market?.question || t.title || "Unknown market",
        marketCategory: market?.category,
        outcome: t.outcome,
        side: (t.side || "BUY").toLowerCase() === "sell" ? "sell" : "buy",
        entryPrice: Number(t.price ?? 0),
        size: Number(t.size ?? 0) * Number(t.price ?? 0),
        timestamp: new Date(Number(t.timestamp) * 1000).toISOString(),
        resolved,
        won,
        txHash: t.transactionHash || undefined,
      };
    });

    return { ok: true, source: "live", data: trades };
  } catch (err: any) {
    return { ok: false, source: "live", error: `Failed to parse/enrich trades response: ${err?.message}` };
  }
}

// --- Market quote: single lookup (use sparingly — see batch version below) ---
export async function fetchMarketQuote(marketId: string): Promise<AdapterResult<MarketQuote>> {
  if (dataSourceMode() === "demo") {
    return { ok: true, source: "demo", data: demoMarketQuote(marketId) };
  }

  const marketMap = await fetchGammaMarketsByConditionIds([marketId]);
  const market = marketMap.get(marketId);
  if (!market) {
    return { ok: false, source: "live", error: `No market found for conditionId ${marketId} (checked both active and closed)` };
  }
  return { ok: true, source: "live", data: gammaMarketToQuote(marketId, market) };
}

// --- Market quotes: BATCH lookup — use this for scoring/updating many trades
// at once instead of calling fetchMarketQuote in a loop. Returns a Map from
// marketId -> either a successful quote or an error string, so the caller
// can handle per-market failures individually without re-fetching anything.
export async function fetchMarketQuotesBatch(
  marketIds: string[]
): Promise<Map<string, { ok: true; data: MarketQuote } | { ok: false; error: string }>> {
  const result = new Map<string, { ok: true; data: MarketQuote } | { ok: false; error: string }>();

  if (dataSourceMode() === "demo") {
    for (const id of marketIds) {
      result.set(id, { ok: true, data: demoMarketQuote(id) });
    }
    return result;
  }

  const marketMap = await fetchGammaMarketsByConditionIds(marketIds);
  for (const id of marketIds) {
    const market = marketMap.get(id);
    if (market) {
      result.set(id, { ok: true, data: gammaMarketToQuote(id, market) });
    } else {
      result.set(id, { ok: false, error: `No market found for conditionId ${id} (checked both active and closed)` });
    }
  }
  return result;
}

// Order book spread lookup — read-only, optional. Never used to place
// orders; there is no order-placement function anywhere in this adapter or
// project.
export async function fetchOrderBookSpread(tokenId: string): Promise<AdapterResult<{ bid: number; ask: number; spread: number }>> {
  if (dataSourceMode() === "demo") {
    return { ok: true, source: "demo", data: { bid: 0.48, ask: 0.5, spread: 0.02 } };
  }
  const { json, error } = await safeFetchJson(`${CLOB_API}/book?token_id=${tokenId}`);
  if (error || !json) {
    return { ok: false, source: "live", error: error || "Empty order book response" };
  }
  try {
    const bestBid = Number(json.bids?.[0]?.price ?? 0);
    const bestAsk = Number(json.asks?.[0]?.price ?? 0);
    return { ok: true, source: "live", data: { bid: bestBid, ask: bestAsk, spread: Number((bestAsk - bestBid).toFixed(4)) } };
  } catch (err: any) {
    return { ok: false, source: "live", error: `Failed to parse order book: ${err?.message}` };
  }
}
