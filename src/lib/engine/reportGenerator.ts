import { db } from "../db";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export interface DailyReportSummary {
  reportId: string;
  paperPnl: number;
  winRate: number;
  botVsBlind: { botPnl: number; blindPnl: number; botWon: boolean };
}

/**
 * Builds the end-of-day report: paper PnL, win rate, best/worst trades and
 * wallets, rule changes made today, and a comparison of the bot-filtered
 * strategy against blindly copying every leaderboard wallet trade.
 */
export async function generateDailyReport(forDate: Date = new Date()): Promise<DailyReportSummary> {
  const day = startOfDay(forDate);
  const nextDay = new Date(day.getTime() + 86400000);

  const paperTradesToday = await db.paperTrade.findMany({
    where: { openedAt: { gte: day, lt: nextDay } },
    include: { decision: { include: { wallet: true } } },
  });

  const resolvedToday = await db.paperTrade.findMany({
    where: { resolvedAt: { gte: day, lt: nextDay } },
  });

  const paperPnl = resolvedToday.reduce((a: number, t: any) => a + (t.realizedPnl ?? 0), 0);
  const wins = resolvedToday.filter((t: any) => (t.realizedPnl ?? 0) > 0).length;
  const winRate = resolvedToday.length > 0 ? wins / resolvedToday.length : 0;

  const sorted = [...resolvedToday].sort((a, b) => (b.realizedPnl ?? 0) - (a.realizedPnl ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // --- Benchmark: bot-filtered vs. blind leaderboard copy ---
  // "Blind copy" = every observed trade from a tracked/watched wallet gets a
  // flat $10 paper position regardless of the bot's scoring. This is
  // approximated from ObservedTrade + a fresh entry/current price diff we
  // already have via the linked DecisionJournal/PaperTrade when present, and
  // is clearly a simplification for benchmarking purposes only.
  const allDecisionsToday = await db.decisionJournal.findMany({
    where: { createdAt: { gte: day, lt: nextDay } },
    include: { paperTrade: true },
  });
  const botPnl = allDecisionsToday.reduce((a: number, d: any) => a + (d.paperTrade?.realizedPnl ?? d.paperTrade?.unrealizedPnl ?? 0), 0);
  // Blind copy assumes every single observed trade (copy, watchlist, or skip) was copied at $10 flat.
  const blindPnlEstimate = allDecisionsToday.reduce((a: number, d: any) => {
    if (d.paperTrade) return a + (d.paperTrade.realizedPnl ?? d.paperTrade.unrealizedPnl ?? 0) * (10 / d.simulatedPositionSize! || 1);
    return a; // no price data available for skipped trades in this simplified estimate
  }, 0);

  const walletPnlToday: Record<string, number> = {};
  for (const t of paperTradesToday) {
    walletPnlToday[t.walletAddress] = (walletPnlToday[t.walletAddress] || 0) + (t.realizedPnl ?? t.unrealizedPnl ?? 0);
  }
  const walletEntries = Object.entries(walletPnlToday).sort((a, b) => b[1] - a[1]);
  const bestWallets = walletEntries.slice(0, 3);
  const worstWallets = walletEntries.slice(-3).reverse();

  const ruleChangesToday = await db.ruleChange.findMany({ where: { createdAt: { gte: day, lt: nextDay } } });

  const newSignals = await db.observedTrade.count({ where: { timestamp: { gte: day, lt: nextDay } } });
  const copiedSignals = allDecisionsToday.filter((d: any) => d.decision === "paper_copy").length;
  const watchedSignals = allDecisionsToday.filter((d: any) => d.decision === "watchlist").length;
  const skippedSignals = allDecisionsToday.filter((d: any) => d.decision === "skip").length;

  const openPositions = await db.paperTrade.count({ where: { status: "open" } });

  const botWon = botPnl >= blindPnlEstimate;
  const lessonReview = await db.outcomeReview.findFirst({
    where: { createdAt: { gte: day, lt: nextDay }, lessonsJson: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  const topLesson = lessonReview ? JSON.parse(lessonReview.lessonsJson || "[]")[0] : "No new lessons recorded today.";

  const summaryText = [
    `Paper PnL today: $${paperPnl.toFixed(2)} (win rate ${(winRate * 100).toFixed(0)}%).`,
    `Bot-filtered strategy ${botWon ? "beat" : "underperformed"} blind leaderboard copy today ($${botPnl.toFixed(2)} vs $${blindPnlEstimate.toFixed(2)} est.).`,
    `${copiedSignals} copied, ${watchedSignals} watchlisted, ${skippedSignals} skipped out of ${newSignals} new signals.`,
    ruleChangesToday.length > 0 ? `${ruleChangesToday.length} rule change(s) made today.` : "No rule changes today.",
  ].join(" ");

  const report = await db.dailyReport.upsert({
    where: { date: day },
    update: {
      paperPnl,
      winRate,
      openPositions,
      newSignals,
      copiedSignals,
      watchedSignals,
      skippedSignals,
      bestWalletsJson: JSON.stringify(bestWallets),
      worstWalletsJson: JSON.stringify(worstWallets),
      ruleChangesJson: JSON.stringify(ruleChangesToday.map((c: any) => ({ reason: c.reason, evidence: c.evidenceSummary }))),
      summary: summaryText,
    },
    create: {
      date: day,
      paperPnl,
      winRate,
      openPositions,
      newSignals,
      copiedSignals,
      watchedSignals,
      skippedSignals,
      bestWalletsJson: JSON.stringify(bestWallets),
      worstWalletsJson: JSON.stringify(worstWallets),
      ruleChangesJson: JSON.stringify(ruleChangesToday.map((c: any) => ({ reason: c.reason, evidence: c.evidenceSummary }))),
      summary: summaryText,
    },
  });

  return { reportId: report.id, paperPnl, winRate, botVsBlind: { botPnl, blindPnl: blindPnlEstimate, botWon } };
}

/**
 * Sends the report to Telegram if TELEGRAM_BOT_TOKEN/CHAT_ID are configured.
 * No-op (and clearly logged as such) if they aren't — this is optional,
 * never required to run the bot.
 */
export async function sendReportToTelegram(reportId: string): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { sent: false, reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping send." };
  }
  const report = await db.dailyReport.findUnique({ where: { id: reportId } });
  if (!report) return { sent: false, reason: "Report not found." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: report.summary }),
    });
    if (!res.ok) return { sent: false, reason: `Telegram API returned HTTP ${res.status}` };
    await db.dailyReport.update({ where: { id: reportId }, data: { sentToTelegram: true } });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, reason: err?.message || String(err) };
  }
}
