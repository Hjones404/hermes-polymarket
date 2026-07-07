// DEMO DATA ONLY.
//
// Everything in this file is synthetic. It exists so the dashboard, scoring
// engine, and paper trading engine can be exercised end to end without a
// network connection to Polymarket. Every record produced here is tagged
// with source: "demo" by the adapter layer before it reaches the database,
// per the build spec's rule that demo data must be clearly labeled and
// never presented as live.

import type { LeaderboardEntry, MarketQuote, WalletTrade } from "./types";

const CATEGORIES = ["Politics", "Crypto", "Sports", "Pop Culture", "Economics", "Science"];

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function demoAddress(i: number) {
  const hex = (i * 999331 + 17).toString(16).padStart(6, "0");
  return `0xDEMO${hex}${"0".repeat(34 - hex.length)}`.slice(0, 42);
}

export function demoLeaderboard(count = 500): LeaderboardEntry[] {
  const rand = seededRandom(42);
  const entries: LeaderboardEntry[] = [];
  for (let i = 1; i <= count; i++) {
    // Power-law-ish PnL distribution so a handful of wallets look like big winners,
    // most look mediocre, some look like one-hit wonders (handled in scoring).
    const skill = Math.max(0, 1 - i / count) * rand();
    const luck = rand() < 0.08 ? rand() * 5000 : 0; // occasional one-hit-wonder spike
    const pnl = Math.round(skill * 20000 + luck - rand() * 500);
    entries.push({
      address: demoAddress(i),
      label: rand() < 0.15 ? `trader_${i}` : undefined,
      rank: i,
      pnl,
      volume: Math.round(pnl * (2 + rand() * 6) + rand() * 5000),
    });
  }
  return entries.sort((a, b) => b.pnl - a.pnl).map((e, idx) => ({ ...e, rank: idx + 1 }));
}

export function demoWalletTrades(address: string, count = 40): WalletTrade[] {
  const seed = address.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = seededRandom(seed || 7);
  const trades: WalletTrade[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const entryPrice = 0.05 + rand() * 0.85;
    const daysAgo = Math.floor(rand() * 30);
    const resolved = daysAgo > 3 && rand() < 0.7;
    trades.push({
      walletAddress: address,
      marketId: `demo-mkt-${Math.floor(rand() * 9000)}`,
      conditionId: `demo-cond-${Math.floor(rand() * 9000)}`,
      marketQuestion: `Will ${category.toLowerCase()} event #${Math.floor(rand() * 900)} resolve YES?`,
      marketCategory: category,
      outcome: rand() < 0.5 ? "YES" : "NO",
      side: rand() < 0.85 ? "buy" : "sell",
      entryPrice: Number(entryPrice.toFixed(3)),
      size: Math.round(50 + rand() * 2000),
      timestamp: new Date(now - daysAgo * 86400000 - rand() * 86400000).toISOString(),
      resolved,
      won: resolved ? rand() < 0.55 : undefined,
    });
  }
  return trades;
}

export function demoMarketQuote(marketId: string): MarketQuote {
  const seed = marketId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = seededRandom(seed || 3);
  const yesPrice = Number((0.05 + rand() * 0.85).toFixed(3));
  const spread = Number((0.005 + rand() * 0.06).toFixed(3));
  return {
    marketId,
    conditionId: `demo-cond-${marketId}`,
    question: `Demo market ${marketId}`,
    category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
    yesPrice,
    noPrice: Number((1 - yesPrice).toFixed(3)),
    bestBid: Number((yesPrice - spread / 2).toFixed(3)),
    bestAsk: Number((yesPrice + spread / 2).toFixed(3)),
    liquidity: Math.round(200 + rand() * 50000),
    volume: Math.round(500 + rand() * 200000),
    secondsToResolution: Math.round(3600 + rand() * 86400 * 60),
  };
}
