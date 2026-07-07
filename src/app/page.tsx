"use client";

import { useEffect, useState } from "react";

interface OverviewData {
  totalPaperPnl: number;
  winRate: number;
  openPositions: number;
  trackedWallets: number;
  copyCandidatesToday: number;
  endOfDayReportStatus: { date: string; sentToTelegram: boolean; summary: string } | null;
  latestRuleChanges: { reason: string; createdAt: string }[];
  pnlSeries: { t: string; pnl: number }[];
}

function Kpi({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className={`text-2xl mt-1 font-semibold ${positive === undefined ? "" : positive ? "text-accent" : "text-danger"}`}>
        {value}
      </div>
    </div>
  );
}

function MiniChart({ series }: { series: { t: string; pnl: number }[] }) {
  if (series.length === 0) {
    return <div className="text-muted text-sm">No resolved paper trades yet.</div>;
  }
  const max = Math.max(...series.map((s) => s.pnl), 0);
  const min = Math.min(...series.map((s) => s.pnl), 0);
  const range = max - min || 1;
  const points = series
    .map((s, i) => {
      const x = (i / Math.max(1, series.length - 1)) * 100;
      const y = 100 - ((s.pnl - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const last = series[series.length - 1].pnl;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-32">
      <polyline points={points} fill="none" stroke={last >= 0 ? "#3ddc97" : "#e85d5d"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-danger">Failed to load overview: {error}</div>;
  if (!data) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-muted text-sm mt-1">Are we profitable on paper? Which wallets are worth copying? What did the bot learn today?</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Kpi label="Total Paper PnL" value={`$${data.totalPaperPnl.toFixed(2)}`} positive={data.totalPaperPnl >= 0} />
        <Kpi label="Win Rate" value={`${(data.winRate * 100).toFixed(0)}%`} />
        <Kpi label="Open Positions" value={String(data.openPositions)} />
        <Kpi label="Tracked Wallets" value={String(data.trackedWallets)} />
        <Kpi label="Copy Candidates Today" value={String(data.copyCandidatesToday)} />
        <Kpi
          label="End-of-Day Report"
          value={data.endOfDayReportStatus ? (data.endOfDayReportStatus.sentToTelegram ? "Sent" : "Generated") : "Pending"}
        />
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted mb-2">Cumulative Paper PnL</div>
        <MiniChart series={data.pnlSeries} />
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted mb-3">Latest rule changes</div>
        {data.latestRuleChanges.length === 0 ? (
          <div className="text-muted text-sm">No rule changes yet.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.latestRuleChanges.map((c, i) => (
              <li key={i} className="border-b border-border pb-2 last:border-0">
                <div>{c.reason}</div>
                <div className="text-xs text-muted">{new Date(c.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.endOfDayReportStatus && (
        <div className="card p-4">
          <div className="text-sm text-muted mb-2">Latest end-of-day summary</div>
          <p className="text-sm">{data.endOfDayReportStatus.summary}</p>
        </div>
      )}
    </div>
  );
}
