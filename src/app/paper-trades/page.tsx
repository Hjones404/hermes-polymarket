"use client";

import { useEffect, useState } from "react";

function formatPrice(p: number | null | undefined) {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) return { text: "Unknown", expired: false };
  const d = new Date(expiresAt);
  const expired = d.getTime() < Date.now();
  return { text: d.toLocaleString(), expired };
}

export default function PaperTradesPage() {
  const [trades, setTrades] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/paper-trades")
      .then((r) => r.json())
      .then(setTrades);
  }, []);

  if (!trades) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Paper Trades</h1>
        <p className="text-muted text-sm mt-1">Simulated positions between $5–$20. No real money, no signing, no execution.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase border-b border-border">
              <th className="text-left p-3">Market</th>
              <th className="text-left p-3">Direction</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Entry</th>
              <th className="text-left p-3">Current</th>
              <th className="text-left p-3">PnL</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Expires</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const expiry = formatExpiry(t.expiresAt);
              return (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-panel2">
                  <td className="p-3 max-w-xs">
                    <div className="truncate" title={t.marketQuestion}>{t.marketQuestion}</div>
                    <div className="text-xs text-muted">{t.marketCategory || "Uncategorized"}</div>
                  </td>
                  <td className="p-3">
                    <span className="badge badge-copy">
                      {t.side === "sell" ? "Selling" : "Buying"} {t.outcome}
                    </span>
                  </td>
                  <td className="p-3">${t.simulatedPositionSize.toFixed(2)}</td>
                  <td className="p-3">{formatPrice(t.entryPrice)}</td>
                  <td className="p-3">{formatPrice(t.currentPrice)}</td>
                  <td className={`p-3 ${(t.realizedPnl ?? t.unrealizedPnl) >= 0 ? "text-accent" : "text-danger"}`}>
                    ${(t.realizedPnl ?? t.unrealizedPnl).toFixed(2)}
                  </td>
                  <td className="p-3">
                    <span className={`badge badge-${t.status === "open" ? "watch" : t.status === "resolved" ? "track" : "ignore"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    <span className={expiry.expired && t.status === "open" ? "text-danger" : "text-muted"}>
                      {expiry.text}
                      {expiry.expired && t.status === "open" ? " (past due)" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
