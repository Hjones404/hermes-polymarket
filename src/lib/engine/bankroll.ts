import { db } from "../db";

export const DEFAULT_STARTING_BALANCE = 200;

export function getStartingBalance(): number {
  const raw = process.env.STARTING_BALANCE;
  const parsed = raw ? Number(raw) : DEFAULT_STARTING_BALANCE;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STARTING_BALANCE;
}

export interface BankrollSummary {
  startingBalance: number;
  openStake: number;      // capital currently locked in open positions
  realizedPnl: number;    // profit/loss from resolved trades
  unrealizedPnl: number;  // mark-to-market on open positions
  availableCash: number;  // cash not locked in open positions
  currentEquity: number;  // startingBalance + realized + unrealized
  roiPct: number;
}

export async function getBankrollSummary(): Promise<BankrollSummary> {
  const startingBalance = getStartingBalance();

  const openTrades = await db.paperTrade.findMany({ where: { status: "open" } });
  const resolvedTrades = await db.paperTrade.findMany({ where: { status: "resolved" } });

  const openStake = openTrades.reduce((a: number, t: any) => a + t.simulatedPositionSize, 0);
  const unrealizedPnl = openTrades.reduce((a: number, t: any) => a + (t.unrealizedPnl ?? 0), 0);
  const realizedPnl = resolvedTrades.reduce((a: number, t: any) => a + (t.realizedPnl ?? 0), 0);

  const availableCash = startingBalance - openStake + realizedPnl;
  const currentEquity = startingBalance + realizedPnl + unrealizedPnl;
  const roiPct = ((currentEquity - startingBalance) / startingBalance) * 100;

  return { startingBalance, openStake, realizedPnl, unrealizedPnl, availableCash, currentEquity, roiPct };
}