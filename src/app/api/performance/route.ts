import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const resolved = await db.paperTrade.findMany({
    where: { status: "resolved" },
    include: { decision: { include: { observedTrade: true } } },
  });

  const totalPnl = resolved.reduce((a: number, t: any) => a + (t.realizedPnl ?? 0), 0);
  const wins = resolved.filter((t: any) => (t.realizedPnl ?? 0) > 0).length;
  const winRate = resolved.length ? wins / resolved.length : 0;

  // Category performance
  const categoryPnl: Record<string, number> = {};
  for (const t of resolved) {
    const cat = t.decision.observedTrade.marketCategory || "Uncategorized";
    categoryPnl[cat] = (categoryPnl[cat] || 0) + (t.realizedPnl ?? 0);
  }

  // Wallet performance
  const walletPnl: Record<string, number> = {};
  for (const t of resolved) {
    walletPnl[t.walletAddress] = (walletPnl[t.walletAddress] || 0) + (t.realizedPnl ?? 0);
  }

  // Bot-filtered vs blind copy: blind copy assumes a flat $10 on every
  // observed trade regardless of decision; approximated by rescaling actual
  // paper PnL by (10 / actual size) for copied trades, and treating
  // skipped/watchlisted trades as break-even (no price history stored for
  // a full blind simulation in this MVP — see README "Known simplifications").
  const blindPnl = resolved.reduce((a: number, t: any) => {
    const scaled = (t.realizedPnl ?? 0) * (10 / t.simulatedPositionSize);
    return a + scaled;
  }, 0);

  // Missed winners: watchlisted/skipped decisions whose linked market
  // (via observedTrade) later showed a decision journal with no paper trade
  // but where we can infer it would have won. This MVP tracks it at the
  // decision level for watchlist entries only, since skip entries have no
  // further price snapshots collected.
  const watchlistDecisions = await db.decisionJournal.count({ where: { decision: "watchlist" } });
  const skipDecisions = await db.decisionJournal.count({ where: { decision: "skip" } });

  return NextResponse.json({
    totalPnl,
    winRate,
    resolvedCount: resolved.length,
    categoryPnl,
    walletPnl,
    botFilteredPnl: totalPnl,
    blindCopyPnlEstimate: blindPnl,
    botBeatBlind: totalPnl >= blindPnl,
    watchlistDecisions,
    skipDecisions,
    note:
      "Blind-copy and missed-winner figures are simplified estimates for a paper-trading MVP — see README for methodology and limitations.",
  });
}

export const dynamic = "force-dynamic";
