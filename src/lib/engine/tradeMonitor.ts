import { db } from "../db";
import { fetchWalletTrades } from "../adapters/polymarketAdapter";

export interface MonitorResult {
  ok: boolean;
  address: string;
  newTrades?: number;
  error?: string;
}

/**
 * Detects new trades for a given wallet by diffing against ObservedTrade
 * rows we already have (matched on walletAddress + marketId + timestamp).
 * Only wallets with status track or watch are worth monitoring closely,
 * but this function can be called for any address.
 */
export async function monitorWallet(address: string): Promise<MonitorResult> {
  const result = await fetchWalletTrades(address, 2); // only need very recent trades
  if (!result.ok) {
    return { ok: false, address, error: result.error };
  }

  let newTrades = 0;
  for (const t of result.data) {
    const existing = await db.observedTrade.findFirst({
      where: { walletAddress: address, marketId: t.marketId, timestamp: new Date(t.timestamp) },
    });
    if (existing) continue;

    await db.observedTrade.create({
      data: {
        walletAddress: address,
        marketId: t.marketId,
        conditionId: t.conditionId,
        marketQuestion: t.marketQuestion,
        marketCategory: t.marketCategory,
        outcome: t.outcome,
        side: t.side,
        walletEntryPrice: t.entryPrice,
        detectedPrice: t.entryPrice, // refined by trade scorer using a fresh quote
        size: t.size,
        timestamp: new Date(t.timestamp),
        rawTradeJson: JSON.stringify(t),
      },
    });
    newTrades++;
  }

  return { ok: true, address, newTrades };
}

export async function monitorTrackedAndWatchedWallets() {
  const wallets = await db.walletProfile.findMany({ where: { status: { in: ["track", "watch"] } } });
  const results: MonitorResult[] = [];
  for (const w of wallets) {
    results.push(await monitorWallet(w.address));
  }
  return results;
}
