import { updateOpenPaperTradesPnl } from "../src/lib/engine/paperTradingEngine";

async function main() {
  console.log("[paper:update-pnl] Updating open paper trades...");
  const summary = await updateOpenPaperTradesPnl();
  console.log(`[paper:update-pnl] updated=${summary.updated} resolved=${summary.resolved}`);
  if (summary.errors.length) {
    console.log("[paper:update-pnl] Errors:");
    for (const e of summary.errors.slice(0, 10)) console.log(`  - ${e}`);
  }
}

main().finally(() => process.exit(0));
