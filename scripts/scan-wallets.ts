import { profileAllWallets } from "../src/lib/engine/walletProfiler";

async function main() {
  console.log("[scan:wallets] Profiling wallets from the last leaderboard scan...");
  const results = await profileAllWallets();
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`[scan:wallets] Profiled ${ok.length} wallets, ${failed.length} failed.`);
  const track = ok.filter((r) => r.status === "track").length;
  const watch = ok.filter((r) => r.status === "watch").length;
  const ignore = ok.filter((r) => r.status === "ignore").length;
  console.log(`[scan:wallets] status counts — track=${track} watch=${watch} ignore=${ignore}`);
  if (failed.length) {
    console.log("[scan:wallets] Failures:");
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.address}: ${f.error}`);
  }
}

main().finally(() => process.exit(0));
