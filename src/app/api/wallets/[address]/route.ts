import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { address: string } }) {
  const wallet = await db.walletProfile.findUnique({ where: { address: params.address } });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const recentTrades = await db.observedTrade.findMany({
    where: { walletAddress: params.address },
    orderBy: { timestamp: "desc" },
    take: 30,
    include: { decision: { include: { paperTrade: true } } },
  });

  return NextResponse.json({
    ...wallet,
    categoryStrengths: wallet.categoryStrengthsJson ? JSON.parse(wallet.categoryStrengthsJson) : {},
    recentTrades: recentTrades.map((t: any) => ({
      marketQuestion: t.marketQuestion,
      marketCategory: t.marketCategory,
      outcome: t.outcome,
      side: t.side,
      walletEntryPrice: t.walletEntryPrice,
      timestamp: t.timestamp,
      decision: t.decision?.decision ?? null,
      copyScore: t.decision?.copyScore ?? null,
      paperTradeStatus: t.decision?.paperTrade?.status ?? null,
      paperTradePnl: t.decision?.paperTrade?.realizedPnl ?? t.decision?.paperTrade?.unrealizedPnl ?? null,
    })),
  });
}

export const dynamic = "force-dynamic";
