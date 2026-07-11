import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const trades = await db.observedTrade.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
    include: { decision: true, wallet: true },
  });

  return NextResponse.json(
    trades.map((t: any) => ({
      id: t.id,
      walletAddress: t.walletAddress,
      walletLabel: t.wallet.label,
      marketQuestion: t.marketQuestion,
      marketCategory: t.marketCategory,
      outcome: t.outcome, // e.g. "Yes"/"No", "Up"/"Down", or a team/side name
      side: t.side, // buy | sell — buying the outcome vs. selling/betting against it
      walletEntryPrice: t.walletEntryPrice,
      detectedPrice: t.detectedPrice,
      timestamp: t.timestamp,
      decision: t.decision?.decision ?? "pending",
      copyScore: t.decision?.copyScore ?? null,
      reasons: t.decision?.reasonsJson ? JSON.parse(t.decision.reasonsJson) : [],
      risks: t.decision?.risksJson ? JSON.parse(t.decision.risksJson) : [],
    }))
  );
}

export const dynamic = "force-dynamic";
