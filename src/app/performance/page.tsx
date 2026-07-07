"use client";

import { useEffect, useState } from "react";

export default function PerformancePage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/performance")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Performance</h1>
        <p className="text-muted text-sm mt-1">Bot-filtered strategy vs. blindly copying every leaderboard trade.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-muted">Bot-filtered PnL</div>
          <div className={`text-lg font-semibold ${data.botFilteredPnl >= 0 ? "text-accent" : "text-danger"}`}>
            ${data.botFilteredPnl.toFixed(2)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Blind copy PnL (est.)</div>
          <div className={`text-lg font-semibold ${data.blindCopyPnlEstimate >= 0 ? "text-accent" : "text-danger"}`}>
            ${data.blindCopyPnlEstimate.toFixed(2)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Win Rate</div>
          <div className="text-lg font-semibold">{(data.winRate * 100).toFixed(0)}%</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Bot beat blind copy?</div>
          <div className={`text-lg font-semibold ${data.botBeatBlind ? "text-accent" : "text-danger"}`}>
            {data.botBeatBlind ? "Yes" : "No"}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted mb-3">PnL by category</div>
        <div className="space-y-2">
          {Object.entries(data.categoryPnl).map(([cat, pnl]: any) => (
            <div key={cat} className="flex justify-between text-sm">
              <span>{cat}</span>
              <span className={Number(pnl) >= 0 ? "text-accent" : "text-danger"}>${Number(pnl).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted mb-3">PnL by wallet</div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {Object.entries(data.walletPnl)
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([addr, pnl]: any) => (
              <div key={addr} className="flex justify-between text-sm">
                <span className="text-muted">{addr.slice(0, 10)}...</span>
                <span className={Number(pnl) >= 0 ? "text-accent" : "text-danger"}>${Number(pnl).toFixed(2)}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="card p-4 flex justify-between text-sm">
        <div>
          <div className="text-muted">Watchlisted</div>
          <div>{data.watchlistDecisions}</div>
        </div>
        <div>
          <div className="text-muted">Skipped</div>
          <div>{data.skipDecisions}</div>
        </div>
      </div>

      <p className="text-xs text-muted">{data.note}</p>
    </div>
  );
}
