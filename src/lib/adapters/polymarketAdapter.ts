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
//     treated as a genuine miss — a market that's already resolved by the
//     time we look it up is a normal, expected case, not an API failure.
//   - GET https://clob.polymarket.com/book?token_id=...     (order book,
//     read-only, used only for the optional spread helper — not on the
//     critical path of scoring)
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

async function safeFetchJson(url: string): Promise<{ json?: any; error?: string }> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
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

// Looks up a batch of condition IDs against Gamma. Tries the default
// (active-market-favoring) query first; for any conditionId that comes back
// empty, retries once with &closed=true, since a market that's already
// resolved by the time we check it is a completely normal occurrence, not
// an error — the previous version of this adapter treated that as a
// permanent "No market found" failure and left those trades stuck unscored
// forever, which is the bug this fixes.
async function fetchGammaMarketsByConditionIds(conditionIds: string[]): Promise<Map<string, GammaMarketSummary>> {
  const map = new Map<string, GammaMarketSummary>();
  const unique = Array.from(new Set(conditionIds)).filter(Boolean);
  const CHUNK = 25;

  async function queryChunk(chunk: string[], extraParams: string): Promise<any[]> {
    const params = chunk.map((id) => `condition_ids=${encodeURIComponent(id)}`).join("&");
    const { json } = await safeFetchJson(`${GAMMA_API}/markets?${params}${extraParams}&limit=${chunk.length}`);
    return Array.isArray(json) ? json : [];
  }

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);

    // First pass: default query (favors active markets).
    const activeRows = await queryChunk(chunk, "");
    for (const row of activeRows) {
      try {
        map.set(row.conditionId, parseGammaMarket(row));
      } catch {
        /* skip unparseable row */
      }
    }

    // Second pass: only for IDs still missing, retry explicitly asking for
    // closed markets.
    const stillMissing = chunk.filter((id) => !map.has(id));
    if (stillMissing.length > 0) {
      const closedRows = await queryChunk(stillMissing, "&closed=true");
      for (const row of closedRows) {
        try {
          map.set(row.conditionId, parseGammaMarket(row));
        } catch {
          /* skip unparseable row */
        }
      }
    }
  }
  return map;
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

// --- Market quote (for scoring a specific new trade) ------------------------
export async function fetchMarketQuote(marketId: string): Promise<AdapterResult<MarketQuote>> {
  if (dataSourceMode() === "demo") {
    return { ok: true, source: "demo", data: demoMarketQuote(marketId) };
  }

  // Try active markets first, then retry once against closed markets before
  // giving up — see fetchGammaMarketsByConditionIds' comment for why.
  let json: any[] = [];
  const { json: activeJson, error: activeError } = await safeFetchJson(
    `${GAMMA_API}/markets?condition_ids=${encodeURIComponent(marketId)}&limit=1`
  );
  if (activeError) {
    return { ok: false, source: "live", error: activeError };
  }
  json = Array.isArray(activeJson) ? activeJson : [];

  if (json.length === 0) {
    const { json: closedJson, error: closedError } = await safeFetchJson(
      `${GAMMA_API}/markets?condition_ids=${encodeURIComponent(marketId)}&closed=true&limit=1`
    );
    if (closedError) {
      return { ok: false, source: "live", error: closedError };
    }
    json = Array.isArray(closedJson) ? closedJson : [];
  }

  if (json.length === 0) {
    return { ok: false, source: "live", error: `No market found for conditionId ${marketId} (checked both active and closed)` };
  }

  try {
    const market = parseGammaMarket(json[0]);
    const yesIdx = market.outcomes.findIndex((o) => o.toLowerCase() === "yes");
    const yesPrice = yesIdx >= 0 ? market.outcomePrices[yesIdx] : market.outcomePrices[0] ?? 0.5;

    const data: MarketQuote = {
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
    return { ok: true, source: "live", data };
  } catch (err: any) {
    return { ok: false, source: "live", error: `Failed to parse market response: ${err?.message}` };
  }
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
