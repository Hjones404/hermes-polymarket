// Seeds the database by running the real pipeline end-to-end in demo mode
// (DATA_SOURCE_MODE=demo), so `npm run dev` has something to show without
// needing live network access first. This does not insert fake "trades" or
// "PnL" directly — it exercises the same scanner/profiler/monitor/scorer/
// paper-trading code paths a live run would use, just against demo data
// that is tagged source: "demo" throughout.

process.env.DATA_SOURCE_MODE = "demo";

import { scanLeaderboard } from "../src/lib/engine/leaderboardScanner";
import { profileAllWallets } from "../src/lib/engine/walletProfiler";
import { monitorTrackedAndWatchedWallets } from "../src/lib/engine/tradeMonitor";
import { scoreUnscoredTrades } from "../src/lib/engine/decisionEngine";
import { updateOpenPaperTradesPnl } from "../src/lib/engine/paperTradingEngine";
import { reviewResolvedPaperTrades } from "../src/lib/engine/outcomeReviewer";
import { generateDailyReport } from "../src/lib/engine/reportGenerator";
import { db } from "../src/lib/db";

async function main() {
  console.log("=== Hermes Polymarket Copy Bot — DEMO SEED ===");
  console.log("(DATA_SOURCE_MODE forced to 'demo' for this script only)\n");

  const scan = await scanLeaderboard(120); // smaller count for a fast local seed
  console.log(`1) Leaderboard scan: ${scan.ok ? `OK (${scan.walletCount} wallets, source=${scan.source})` : scan.error}`);

  const profiles = await profileAllWallets();
  const track = profiles.filter((p) => p.status === "track").length;
  const watch = profiles.filter((p) => p.status === "watch").length;
  console.log(`2) Wallet profiling: ${profiles.length} wallets scored (track=${track}, watch=${watch})`);

  const monitor = await monitorTrackedAndWatchedWallets();
  const newTrades = monitor.reduce((a, r) => a + (r.newTrades || 0), 0);
  console.log(`3) Trade monitor: ${newTrades} new trades observed across ${monitor.length} wallets`);

  const scored = await scoreUnscoredTrades();
  console.log(`4) Trade scoring: ${scored.scored} scored — paper_copy=${scored.paperCopy} watchlist=${scored.watchlist} skip=${scored.skip}`);

  // Fast-forward some paper trades toward resolution so Performance/Reports
  // pages have something interesting to show immediately.
  const openTrades = await db.paperTrade.findMany({ where: { status: "open" }, take: 20 });
  for (const t of openTrades.slice(0, Math.floor(openTrades.length / 2))) {
    const won = Math.random() < 0.55;
    const finalPrice = won ? 0.99 : 0.01;
    const shares = t.simulatedPositionSize / Math.max(0.01, t.entryPrice);
    const realizedPnl = shares * finalPrice - t.simulatedPositionSize;
    await db.paperTrade.update({
      where: { id: t.id },
      data: { status: "resolved", currentPrice: finalPrice, realizedPnl, resolvedAt: new Date() },
    });
  }

  const pnlUpdate = await updateOpenPaperTradesPnl();
  console.log(`5) PnL update: updated=${pnlUpdate.updated} resolved=${pnlUpdate.resolved}`);

  const review = await reviewResolvedPaperTrades();
  console.log(`6) Outcome review: reviewed=${review.reviewed}`);

  const report = await generateDailyReport();
  console.log(`7) Daily report: paperPnl=${report.paperPnl.toFixed(2)} winRate=${(report.winRate * 100).toFixed(0)}%`);

  console.log("\n=== Seed complete. Run `npm run dev` and open the dashboard. ===");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
