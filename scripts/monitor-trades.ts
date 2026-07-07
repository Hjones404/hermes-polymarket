import { monitorTrackedAndWatchedWallets } from "../src/lib/engine/tradeMonitor";

async function main() {
  console.log("[monitor:trades] Checking tracked/watched wallets for new trades...");
  const results = await monitorTrackedAndWatchedWallets();
  const totalNew = results.reduce((a, r) => a + (r.newTrades || 0), 0);
  const failed = results.filter((r) => !r.ok);
  console.log(`[monitor:trades] Found ${totalNew} new trades across ${results.length} wallets.`);
  if (failed.length) {
    console.log("[monitor:trades] Failures:");
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.address}: ${f.error}`);
  }
}

main().finally(() => process.exit(0));
