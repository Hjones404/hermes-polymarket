import { scanLeaderboard } from "../src/lib/engine/leaderboardScanner";

async function main() {
  console.log("[scan:leaderboard] Starting leaderboard scan...");
  const result = await scanLeaderboard(500);
  if (!result.ok) {
    console.error(`[scan:leaderboard] FAILED: ${result.error}`);
    process.exit(1);
  }
  console.log(`[scan:leaderboard] OK — source=${result.source} walletCount=${result.walletCount} scanId=${result.scanId}`);
}

main().finally(() => process.exit(0));
