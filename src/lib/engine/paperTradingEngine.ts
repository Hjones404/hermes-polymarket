import { db } from "../db";
import { fetchMarketQuotesBatch } from "../adapters/polymarketAdapter";

export interface PnlUpdateSummary {
  updated: number;
  resolved: number;
  errors: string[];
}

function computeUnrealizedPnl(side: string, entryPrice: number, currentPrice: number, size: number) {
  // "size" here is the simulated dollar position size (paper money only).
  const shares = size / Math.max(0.01, entryPrice);
  const value = shares * currentPrice;
  return side === "sell" ? size - value : value - size;
}

/**
 * Updates currentPrice + unrealizedPnl for every open PaperTrade, and closes
 * out trades whose market has resolved. Meant to run hourly via Hermes cron.
 *
 * Quotes for every open position are fetched in one batched round (chunked
 * ~25-at-a-time) instead of one HTTP call per trade, to avoid the same
 * rate-limit issue that hit score:trades before it was batched.
 */
export async function updateOpenPaperTradesPnl(): Promise<PnlUpdateSummary> {
  const openTrades = await db.paperTrade.findMany({ where: { status: "open" } });
  const summary: PnlUpdateSummary = { updated: 0, resolved: 0, errors: [] };

  if (openTrades.length === 0) return summary;

  const quotes = await fetchMarketQuotesBatch(openTrades.map((t) => t.marketId));

  for (const trade of openTrades) {
    const quoteResult = quotes.get(trade.marketId);
    if (!quoteResult || !quoteResult.ok) {
      summary.errors.push(`Market ${trade.marketId}: ${quoteResult ? quoteResult.error : "No quote returned"}`);
      continue;
    }

    const currentPrice = trade.outcome === "YES" ? quoteResult.data.yesPrice : quoteResult.data.noPrice;
    const unrealizedPnl = computeUnrealizedPnl(trade.side, trade.entryPrice, currentPrice, trade.simulatedPositionSize);
    const isResolved = currentPrice <= 0.01 || currentPrice >= 0.99;

    await db.paperTrade.update({
      where: { id: trade.id },
      data: {
        currentPrice,
        unrealizedPnl,
        status: isResolved ? "resolved" : "open",
        realizedPnl: isResolved ? unrealizedPnl : undefined,
        resolvedAt: isResolved ? new Date() : undefined,
      },
    });

    await db.pnlSnapshot.create({
      data: { paperTradeId: trade.id, price: currentPrice, pnl: unrealizedPnl },
    });

    summary.updated++;
    if (isResolved) summary.resolved++;
  }

  return summary;
}
