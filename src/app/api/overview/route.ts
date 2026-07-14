import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBankrollSummary } from "@/lib/engine/bankroll";

export async function GET() {
  const [openPositions, trackedWallets, latestReport, latestRuleChanges, resolvedTrades] = await Promise.all([
    db.paperTrade.count({ where: { status: "open" } }),
    db.walletProfile.count({ where: { status: "track" } }),
    db.dailyReport.findFirst({ orderBy: { date: "desc" } }),
    db.ruleChange.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.paperTrade.findMany({ where: { status: "resolved" }, orderBy: { resolvedAt: "asc" } }),
  ]);

  const bankroll = await getBankrollSummary();
  const totalPaperPnl = resolvedTrades.reduce((a: number, t: any) => a + (t.realizedPnl ?? 0), 0);
  const wins = resolvedTrades.filter((t: any) => (t.realizedPnl ?? 0) > 0).length;
  const winRate = resolvedTrades.length > 0 ? wins / resolvedTrades.length : 0;

  let running = 0;
  const pnlSeries = resolvedTrades.map((t: any) => {
    running += t.realizedPnl ?? 0;
    return { t: t.resolvedAt?.toISOString() ?? "", pnl: Number(running.toFixed(2)) };
  });

  const copyCandidatesToday = await db.decisionJournal.count({
    where: {
      createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      decision: "paper_copy",
    },
  });

  return NextResponse.json({
    startingBalance: bankroll.startingBalance,
    currentEquity: bankroll.currentEquity,
    availableCash: bankroll.availableCash,
    roiPct: bankroll.roiPct,
    totalPaperPnl,
    winRate,
    openPositions,
    trackedWallets,
    copyCandidatesToday,
    endOfDayReportStatus: latestReport
      ? { date: latestReport.date, sentToTelegram: latestReport.sentToTelegram, summary: latestReport.summary }
      : null,
    latestRuleChanges: latestRuleChanges.map((c: any) => ({ reason: c.reason, createdAt: c.createdAt })),
    pnlSeries,
  });
}

export const dynamic = "force-dynamic";
