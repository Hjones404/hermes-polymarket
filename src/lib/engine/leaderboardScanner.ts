import { db } from "../db";
import { fetchLeaderboard } from "../adapters/polymarketAdapter";

export interface ScanResult {
  ok: boolean;
  source?: "live" | "demo";
  walletCount?: number;
  error?: string;
  scanId?: string;
}

/**
 * Pulls the top-N leaderboard wallets and records a LeaderboardScan.
 * Per the safety spec: if the live call fails, we surface the real error
 * and do NOT fabricate a scan. Demo mode is the only path that returns
 * synthetic data, and it is clearly tagged as such in rawSummaryJson.
 */
export async function scanLeaderboard(count = 500): Promise<ScanResult> {
  const result = await fetchLeaderboard(count);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const scan = await db.leaderboardScan.create({
    data: {
      source: result.source === "demo" ? "demo" : "polymarket",
      walletCount: result.data.length,
      lookbackDays: 30,
      rawSummaryJson: JSON.stringify({
        labeledAs: result.source, // "live" | "demo" — always present so the UI can badge it
        entries: result.data,
      }),
    },
  });

  // Upsert a bare WalletProfile row per leaderboard entry so the wallet
  // profiler has something to enrich. Scoring fields stay at defaults until
  // scan:wallets runs.
  for (const entry of result.data) {
    await db.walletProfile.upsert({
      where: { address: entry.address },
      update: { sourceRank: entry.rank, label: entry.label, lastScannedAt: new Date() },
      create: {
        address: entry.address,
        label: entry.label,
        sourceRank: entry.rank,
        status: "watch",
        lastScannedAt: new Date(),
      },
    });
  }

  return { ok: true, source: result.source, walletCount: result.data.length, scanId: scan.id };
}
