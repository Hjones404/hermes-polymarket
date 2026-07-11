import { db } from "../db";
import { fetchWalletTrades } from "../adapters/polymarketAdapter";

export interface MonitorResult {
  ok: boolean;
  address: string;
  newTrades?: number;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detects new trades for a given wallet. De-duplicates primarily on the
 * trade's txHash (a real, stable identifier from the Data API) when present;
 * falls back to the old walletAddress+marketId+timestamp match only for
 * demo data or trades that somehow lack a txHash.
 */
export async function monitorWallet(address: string): Promise<MonitorResult> {
  const result = await fetchWalletTrades(address, 2); // only need very recent trades
  if (!result.ok) {
    return { ok: false, address, error: result.error };
  }

  let newTrades = 0;
  for (const t of result.data) {
    let existing = null;
    if (t.txHash) {
      existing = await db.observedTrade.findFirst({
        where: { walletAddress: address, txHash: t.txHash },
      });
    } else {
      existing = await db.observedTrade.findFirst({
        where: { walletAddress: address, marketId: t.marketId, timestamp: new Date(t.timestamp) },
      });
    }
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
        detectedPrice: t.entryPrice,
        size: t.size,
        timestamp: new Date(t.timestamp),
        txHash: t.txHash,
        rawTradeJson: JSON.stringify(t),
      },
    });
    newTrades++;
  }

  return { ok: true, address, newTrades };
}

/**
 * Iterates every tracked/watched wallet. A small delay between wallets
 * spreads out the Gamma API calls each fetchWalletTrades makes internally —
 * without this, hundreds of wallets processed back-to-back with no pause
 * can trip Polymarket's rate limit on their own, even with monitor:trades
 * and score:trades no longer running concurrently (see crontab.txt).
 */
export async function monitorTrackedAndWatchedWallets(delayMs = 150) {
  const wallets = await db.walletProfile.findMany({ where: { status: { in: ["track", "watch"] } } });
  const results: MonitorResult[] = [];
  for (const w of wallets) {
    results.push(await monitorWallet(w.address));
    await sleep(delayMs);
  }
  return results;
}
