import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const trades = await db.paperTrade.findMany({
    orderBy: { openedAt: "desc" },
    take: 200,
    include: { decision: true },
  });

  return NextResponse.json(
    trades.map((t: any) => ({
      id: t.id,
      walletAddress: t.walletAddress,
      marketId: t.marketId,
      outcome: t.outcome,
      side: t.side,
      simulatedPositionSize: t.simulatedPositionSize,
      entryPrice: t.entryPrice,
      currentPrice: t.currentPrice,
      unrealizedPnl: t.unrealizedPnl,
      realizedPnl: t.realizedPnl,
      status: t.status,
      openedAt: t.openedAt,
      resolvedAt: t.resolvedAt,
      reason: t.decision?.reasonsJson ? JSON.parse(t.decision.reasonsJson)[0] : null,
    }))
  );
}
