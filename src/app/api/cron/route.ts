import { NextResponse } from "next/server";
import { scanLeaderboard } from "@/lib/engine/leaderboardScanner";
import { profileAllTrackedOrWatchedWallets } from "@/lib/engine/walletProfiler";
import { monitorTrackedAndWatchedWallets } from "@/lib/engine/tradeMonitor";
import { scoreUnscoredTrades } from "@/lib/engine/decisionEngine";
import { updateOpenPaperTradesPnl } from "@/lib/engine/paperTradingEngine";
import { reviewResolvedPaperTrades } from "@/lib/engine/outcomeReviewer";
import { autoUpdateRules } from "@/lib/engine/ruleAutoUpdater";
import { generateDailyReport, sendReportToTelegram } from "@/lib/engine/reportGenerator";

// This route lets Hermes Agent (github.com/NousResearch/hermes-agent) run the
// operational loop over HTTP on a cron schedule instead of shelling out to
// `npm run` scripts directly. It performs the same read-only, paper-trading
// steps as the CLI scripts — no order placement, no signing, no keys.
//
// Protect this in production by setting CRON_SECRET and checking it here,
// since it's an unauthenticated mutation endpoint otherwise.

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Invalid or missing x-cron-secret header." }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const step = url.searchParams.get("step") || "full-loop";

  try {
    switch (step) {
      case "scan-leaderboard": {
        const r = await scanLeaderboard(500);
        return NextResponse.json(r);
      }
      case "scan-wallets": {
        const r = await profileAllTrackedOrWatchedWallets();
        return NextResponse.json({ profiled: r.length });
      }
      case "monitor-trades": {
        const r = await monitorTrackedAndWatchedWallets();
        return NextResponse.json({ wallets: r.length, newTrades: r.reduce((a, x) => a + (x.newTrades || 0), 0) });
      }
      case "score-trades": {
        const r = await scoreUnscoredTrades();
        return NextResponse.json(r);
      }
      case "paper-update-pnl": {
        const r = await updateOpenPaperTradesPnl();
        return NextResponse.json(r);
      }
      case "review-outcomes": {
        const r = await reviewResolvedPaperTrades();
        return NextResponse.json(r);
      }
      case "update-rules": {
        const r = await autoUpdateRules();
        return NextResponse.json(r);
      }
      case "report-daily": {
        const r = await generateDailyReport();
        const telegram = await sendReportToTelegram(r.reportId);
        return NextResponse.json({ ...r, telegram });
      }
      case "full-loop": {
        const leaderboard = await scanLeaderboard(500);
        const profiles = await profileAllTrackedOrWatchedWallets();
        const monitor = await monitorTrackedAndWatchedWallets();
        const scored = await scoreUnscoredTrades();
        const pnl = await updateOpenPaperTradesPnl();
        const review = await reviewResolvedPaperTrades();
        const rules = await autoUpdateRules();
        return NextResponse.json({ leaderboard, profiled: profiles.length, monitor, scored, pnl, review, rules });
      }
      default:
        return NextResponse.json({ error: `Unknown step "${step}"` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
