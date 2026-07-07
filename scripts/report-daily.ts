import { generateDailyReport, sendReportToTelegram } from "../src/lib/engine/reportGenerator";

async function main() {
  console.log("[report:daily] Generating end-of-day report...");
  const report = await generateDailyReport();
  console.log(`[report:daily] reportId=${report.reportId} paperPnl=${report.paperPnl.toFixed(2)} winRate=${(report.winRate * 100).toFixed(0)}%`);
  console.log(`[report:daily] bot-filtered vs blind copy: $${report.botVsBlind.botPnl.toFixed(2)} vs $${report.botVsBlind.blindPnl.toFixed(2)} — bot ${report.botVsBlind.botWon ? "won" : "lost"}`);

  const telegramResult = await sendReportToTelegram(report.reportId);
  if (telegramResult.sent) {
    console.log("[report:daily] Sent to Telegram.");
  } else {
    console.log(`[report:daily] Not sent to Telegram: ${telegramResult.reason}`);
  }
}

main().finally(() => process.exit(0));
