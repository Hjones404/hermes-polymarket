"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function WalletProfilePage() {
  const params = useParams<{ address: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/wallets/${params.address}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)));
  }, [params.address]);

  if (error) return <div className="text-danger">{error}</div>;
  if (!data) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{data.label || data.address}</h1>
        <p className="text-muted text-xs mt-1 break-all">{data.address}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-muted">ROI (30d)</div>
          <div className={`text-lg font-semibold ${data.roi30d >= 0 ? "text-accent" : "text-danger"}`}>
            {(data.roi30d * 100).toFixed(1)}%
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Trades (30d)</div>
          <div className="text-lg font-semibold">{data.tradeCount30d}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Win Rate (resolved)</div>
          <div className="text-lg font-semibold">{(data.winRate30d * 100).toFixed(0)}%</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Avg Trade Size</div>
          <div className="text-lg font-semibold">${Math.round(data.averageTradeSize)}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted mb-2">Category strengths</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.categoryStrengths || {}).map(([cat, score]: any) => (
            <span key={cat} className="badge badge-track">
              {cat}: {(Number(score) * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm text-muted mb-1">Copyability</div>
        <p className="text-sm">{data.copyabilityNotes}</p>
      </div>
      <div className="card p-4">
        <div className="text-sm text-muted mb-1">Risk notes</div>
        <p className="text-sm">{data.riskNotes}</p>
      </div>

      <div className="card overflow-x-auto">
        <div className="text-sm text-muted p-3 border-b border-border">Recent trades</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase border-b border-border">
              <th className="text-left p-3">Market</th>
              <th className="text-left p-3">Entry</th>
              <th className="text-left p-3">Decision</th>
              <th className="text-left p-3">Paper PnL</th>
            </tr>
          </thead>
          <tbody>
            {data.recentTrades.map((t: any, i: number) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="p-3">{t.marketQuestion}</td>
                <td className="p-3">{t.walletEntryPrice}</td>
                <td className="p-3">
                  <span className={`badge badge-${t.decision || "skip"}`}>{t.decision || "pending"}</span>
                </td>
                <td className={`p-3 ${(t.paperTradePnl ?? 0) >= 0 ? "text-accent" : "text-danger"}`}>
                  {t.paperTradePnl !== null ? `$${Number(t.paperTradePnl).toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
