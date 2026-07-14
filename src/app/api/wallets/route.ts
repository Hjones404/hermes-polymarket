import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const wallets = await db.walletProfile.findMany({
    orderBy: { globalScore: "desc" },
    take: 500,
  });

  return NextResponse.json(
    wallets.map((w: any) => ({
      address: w.address,
      label: w.label,
      sourceRank: w.sourceRank,
      globalScore: w.globalScore,
      roi30d: w.roi30d,
      consistencyScore: w.consistencyScore,
      copyabilityScore: w.copyabilityScore,
      oneHitWonderPenalty: w.oneHitWonderPenalty,
      bestCategory: w.bestCategory,
      status: w.status,
      copyabilityNotes: w.copyabilityNotes,
      riskNotes: w.riskNotes,
    }))
  );
}

export const dynamic = "force-dynamic";
