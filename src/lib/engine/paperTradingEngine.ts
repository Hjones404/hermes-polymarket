import { db } from "../db";
import { fetchMarketQuote } from "../adapters/polymarketAdapter";

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
 */
export async function updateOpenPaperTradesPnl(): Promise<PnlUpdateSummary> {
  const openTrades = await db.paperTrade.findMany({ where: { status: "open" } });
  const summary: PnlUpdateSummary = { updated: 0, resolved: 0, errors: [] };

  for (const trade of openTrades) {
    const quote = await fetchMarketQuote(trade.marketId);
    if (!quote.ok) {
      summary.errors.push(`Market ${trade.marketId}: ${quote.error}`);
      continue;
    }

    const currentPrice = trade.outcome === "YES" ? quote.data.yesPrice : quote.data.noPrice;
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
