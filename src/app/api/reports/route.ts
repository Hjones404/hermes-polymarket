import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const reports = await db.dailyReport.findMany({ orderBy: { date: "desc" }, take: 30 });

  return NextResponse.json(
    reports.map((r: any) => ({
      date: r.date,
      paperPnl: r.paperPnl,
      winRate: r.winRate,
      openPositions: r.openPositions,
      newSignals: r.newSignals,
      copiedSignals: r.copiedSignals,
      watchedSignals: r.watchedSignals,
      skippedSignals: r.skippedSignals,
      bestWallets: JSON.parse(r.bestWalletsJson),
      worstWallets: JSON.parse(r.worstWalletsJson),
      ruleChanges: JSON.parse(r.ruleChangesJson),
      summary: r.summary,
      sentToTelegram: r.sentToTelegram,
    }))
  );
}
