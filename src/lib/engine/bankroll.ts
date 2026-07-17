import { db } from "../db";

export const DEFAULT_STARTING_BALANCE = 200;
export const DEFAULT_MAX_EXPOSURE_PCT = 0.33; // no more than this % of CURRENT EQUITY staked at once

export function getStartingBalance(): number {
  const raw = process.env.STARTING_BALANCE;
  const parsed = raw ? Number(raw) : DEFAULT_STARTING_BALANCE;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STARTING_BALANCE;
}

export function getMaxExposurePct(): number {
  const raw = process.env.MAX_EXPOSURE_PCT;
  const parsed = raw ? Number(raw) : DEFAULT_MAX_EXPOSURE_PCT;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_MAX_EXPOSURE_PCT;
}

export interface BankrollSummary {
  startingBalance: number;
  maxExposurePct: number;
  maxExposure: number; // dollar cap on simultaneous open stake — now = currentEquity * maxExposurePct
  openStake: number; // capital currently locked in open positions
  realizedPnl: number; // profit/loss from resolved trades
  unrealizedPnl: number; // mark-to-market on open positions
  availableCash: number; // cash-based limit: startingBalance - openStake + realizedPnl
  exposureHeadroom: number; // exposure-based limit: maxExposure - openStake
  currentEquity: number; // startingBalance + realizedPnl + unrealizedPnl
  roiPct: number;
  currentExposurePct: number; // openStake as a % of CURRENT EQUITY (not the original starting balance)
}

export async function getBankrollSummary(): Promise<BankrollSummary> {
  const startingBalance = getStartingBalance();
  const maxExposurePct = getMaxExposurePct();

  const openTrades = await db.paperTrade.findMany({ where: { status: "open" } });
  const resolvedTrades = await db.paperTrade.findMany({ where: { status: "resolved" } });

  const openStake = openTrades.reduce((a: number, t: any) => a + t.simulatedPositionSize, 0);
  const unrealizedPnl = openTrades.reduce((a: number, t: any) => a + (t.unrealizedPnl ?? 0), 0);
  const realizedPnl = resolvedTrades.reduce((a: number, t: any) => a + (t.realizedPnl ?? 0), 0);

  const currentEquity = startingBalance + realizedPnl + unrealizedPnl;

  // Exposure cap now scales with current equity, not the fixed original starting
  // balance — as the bankroll grows, the dollar amount you're allowed to have
  // staked at once grows with it (and shrinks if equity drops), rather than
  // being pinned forever to a % of the original $200.
  const maxExposure = currentEquity * maxExposurePct;
  const exposureHeadroom = maxExposure - openStake;

  const availableCash = startingBalance - openStake + realizedPnl;
  const roiPct = ((currentEquity - startingBalance) / startingBalance) * 100;
  const currentExposurePct = currentEquity > 0 ? (openStake / currentEquity) * 100 : 0;

  return {
    startingBalance,
    maxExposurePct,
    maxExposure,
    openStake,
    realizedPnl,
    unrealizedPnl,
    availableCash,
    exposureHeadroom,
    currentEquity,
    roiPct,
    currentExposurePct,
  };
}
