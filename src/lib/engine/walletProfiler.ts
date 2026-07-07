import { db } from "../db";
import { fetchWalletTrades } from "../adapters/polymarketAdapter";
import { scoreWallet } from "../scoring/walletScoring";
import { getActiveRules } from "./ruleEngine";

export interface ProfileResult {
  ok: boolean;
  address: string;
  status?: string;
  globalScore?: number;
  error?: string;
}

/**
 * Analyzes the last 30 days of a wallet's activity and updates its
 * WalletProfile with fresh scores. Skips (rather than fakes) wallets whose
 * trade history can't be fetched.
 */
export async function profileWallet(address: string): Promise<ProfileResult> {
  const rules = await getActiveRules();
  const result = await fetchWalletTrades(address, 30);
  if (!result.ok) {
    return { ok: false, address, error: result.error };
  }

  const score = scoreWallet({ address, trades: result.data, rules });

  await db.walletProfile.update({
    where: { address },
    data: {
      roi30d: score.roi30d,
      consistencyScore: score.consistencyScore,
      copyabilityScore: score.copyabilityScore,
      oneHitWonderPenalty: score.oneHitWonderPenalty,
      globalScore: score.globalScore,
      bestCategory: score.bestCategory,
      categoryStrengthsJson: JSON.stringify(score.categoryStrengths),
      averageTradeSize: score.averageTradeSize,
      tradeCount30d: score.tradeCount30d,
      resolvedTradeCount30d: score.resolvedTradeCount30d,
      winRate30d: score.winRate30d,
      averageLiquidity: score.averageLiquidity,
      averageSpread: score.averageSpread,
      averageEntryTiming: score.averageEntryTiming,
      status: score.status,
      copyabilityNotes: score.copyabilityNotes,
      riskNotes: score.riskNotes,
      lastScannedAt: new Date(),
    },
  });

  return { ok: true, address, status: score.status, globalScore: score.globalScore };
}

export async function profileAllTrackedOrWatchedWallets() {
  const wallets = await db.walletProfile.findMany({ where: { status: { in: ["track", "watch"] } } });
  const results: ProfileResult[] = [];
  for (const w of wallets) {
    results.push(await profileWallet(w.address));
  }
  return results;
}

export async function profileAllWallets() {
  const wallets = await db.walletProfile.findMany();
  const results: ProfileResult[] = [];
  for (const w of wallets) {
    results.push(await profileWallet(w.address));
  }
  return results;
}
