"use client";

import { useEffect, useState } from "react";

export default function ReportsPage() {
  const [reports, setReports] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then(setReports);
  }, []);

  if (!reports) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-muted text-sm mt-1">End-of-day reports Hermes has generated (and optionally sent to Telegram).</p>
      </div>

      {reports.length === 0 && <div className="text-muted text-sm">No reports yet — run report:daily.</div>}

      <div className="space-y-4">
        {reports.map((r, i) => (
          <div key={i} className="card p-4">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">{new Date(r.date).toLocaleDateString()}</div>
              <span className={`badge ${r.sentToTelegram ? "badge-track" : "badge-watch"}`}>
                {r.sentToTelegram ? "Sent to Telegram" : "Not sent"}
              </span>
            </div>
            <p className="text-sm mt-2">{r.summary}</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3 text-xs">
              <div><div className="text-muted">PnL</div><div>${r.paperPnl.toFixed(2)}</div></div>
              <div><div className="text-muted">Win rate</div><div>{(r.winRate * 100).toFixed(0)}%</div></div>
              <div><div className="text-muted">New signals</div><div>{r.newSignals}</div></div>
              <div><div className="text-muted">Copied</div><div>{r.copiedSignals}</div></div>
              <div><div className="text-muted">Watched</div><div>{r.watchedSignals}</div></div>
              <div><div className="text-muted">Skipped</div><div>{r.skippedSignals}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
