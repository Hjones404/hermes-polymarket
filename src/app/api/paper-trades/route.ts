import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const trades = await db.paperTrade.findMany({
    orderBy: { openedAt: "desc" },
    take: 200,
    include: { decision: { include: { observedTrade: true } } },
  });

  return NextResponse.json(
    trades.map((t: any) => ({
      id: t.id,
      walletAddress: t.walletAddress,
      marketId: t.marketId,
      marketQuestion: t.decision?.observedTrade?.marketQuestion ?? t.marketId,
      marketCategory: t.decision?.observedTrade?.marketCategory ?? null,
      outcome: t.outcome, // e.g. "Yes"/"No", "Up"/"Down", or a team/side name
      side: t.side, // buy | sell
      simulatedPositionSize: t.simulatedPositionSize,
      entryPrice: t.entryPrice,
      currentPrice: t.currentPrice,
      unrealizedPnl: t.unrealizedPnl,
      realizedPnl: t.realizedPnl,
      status: t.status,
      openedAt: t.openedAt,
      resolvedAt: t.resolvedAt,
      expiresAt: t.expiresAt, // market's expected resolution date, captured when the trade opened
      reason: t.decision?.reasonsJson ? JSON.parse(t.decision.reasonsJson)[0] : null,
    }))
  );
}

export const dynamic = "force-dynamic";
