// Polymarket adapter layer.
//
// IMPORTANT — read before relying on this in production:
// This project was built in a sandboxed environment with no network egress
// to polymarket.com, so the exact endpoint paths and response shapes below
// could not be verified against the live API while building this repo.
// Polymarket's public API surface (gamma-api / data-api / clob) has changed
// shape before and may again. Treat the URLs and field mappings here as a
// best-effort starting point, and confirm them against
// https://docs.polymarket.com before trusting the numbers.
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

// Polymarket adapter layer.
//
// Endpoints verified against https://docs.polymarket.com (July 2026) — a step
// that could NOT be done from the sandboxed container that first assembled
// this repo (no network egress to polymarket.com there), so this file has
// since been corrected against the real, documented API shapes:
//   - GET https://data-api.polymarket.com/v1/leaderboard  (max 50 per page,
//     paginated via offset up to 1000 — NOT a single limit=500 call)
//   - GET https://data-api.polymarket.com/trades           (per-user trade
//     history — does NOT include category/resolved/won; those are derived
//     below via a Gamma market lookup keyed on conditionId)
//   - GET https://gamma-api.polymarket.com/markets?condition_ids=...  (market
//     metadata, prices, liquidity, close status)
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
// /v1/leaderboard caps `limit` at 50 per call and `offset` at 1000, so
// pulling e.g. 500 wallets means paging through 10 calls of 50.
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
// Batches condition IDs into a single Gamma /markets?condition_ids= call so
// we don't issue one HTTP request per trade. Used to derive category,
// resolved/won status, and quote data that the Data API's /trades endpoint
// does not itself provide.
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

async function fetchGammaMarketsByConditionIds(conditionIds: string[]): Promise<Map<string, GammaMarketSummary>> {
  const map = new Map<string, GammaMarketSummary>();
  const unique = Array.from(new Set(conditionIds)).filter(Boolean);
  const CHUNK = 25; // keep query strings/URLs reasonably sized

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const params = chunk.map((id) => `condition_ids=${encodeURIComponent(id)}`).join("&");
    const { json, error } = await safeFetchJson(`${GAMMA_API}/markets?${params}&limit=${chunk.length}`);
    if (error || !Array.isArray(json)) continue; // best-effort enrichment; caller handles missing entries
    for (const row of json) {
      try {
        map.set(row.conditionId, parseGammaMarket(row));
      } catch {
        // skip unparseable row rather than failing the whole batch
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
        marketId: t.conditionId, // used as our lookup key against Gamma going forward
        conditionId: t.conditionId,
        marketQuestion: market?.question || t.title || "Unknown market",
        marketCategory: market?.category,
        outcome: t.outcome,
        side: (t.side || "BUY").toLowerCase() === "sell" ? "sell" : "buy",
        entryPrice: Number(t.price ?? 0),
        size: Number(t.size ?? 0) * Number(t.price ?? 0), // Data API `size` is in shares; convert to USD notional
        timestamp: new Date(Number(t.timestamp) * 1000).toISOString(),
        resolved,
        won,
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

  // `marketId` is a conditionId throughout this app (see fetchWalletTrades).
  const { json, error } = await safeFetchJson(`${GAMMA_API}/markets?condition_ids=${encodeURIComponent(marketId)}&limit=1`);
  if (error) {
    return { ok: false, source: "live", error };
  }
  if (!Array.isArray(json) || json.length === 0) {
    return { ok: false, source: "live", error: `No market found for conditionId ${marketId}` };
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

// Order book spread lookup — read-only, optional finer-grained spread source
// (the Gamma market's bestBid/bestAsk used above is usually sufficient).
// Never used to place orders; there is no order-placement function anywhere
// in this adapter or project. Requires a CLOB token_id (not a conditionId) —
// look one up via `clobTokenIds` on the Gamma market response if you wire
// this in.
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
