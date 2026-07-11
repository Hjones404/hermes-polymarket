"use client";

import { useEffect, useState } from "react";

function formatPrice(p: number | null | undefined) {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

function DirectionBadge({ outcome, side }: { outcome: string; side: string }) {
  const label = side === "sell" ? "Selling" : "Buying";
  return (
    <span className="badge badge-copy">
      {label} {outcome}
    </span>
  );
}

export default function TradeSignalsPage() {
  const [signals, setSignals] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then(setSignals);
  }, []);

  if (!signals) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Trade Signals</h1>
        <p className="text-muted text-sm mt-1">New trades detected from tracked/watched wallets and how the bot scored them.</p>
      </div>

      <div className="space-y-3">
        {signals.length === 0 && <div className="text-muted text-sm">No signals yet — run monitor:trades and score:trades.</div>}
        {signals.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="text-sm font-medium">{s.marketQuestion}</div>
                <div className="mt-2">
                  <DirectionBadge outcome={s.outcome} side={s.side} />
                </div>
                <div className="text-xs text-muted mt-2">
                  {s.walletLabel || s.walletAddress.slice(0, 10)} · {s.marketCategory || "Uncategorized"} ·{" "}
                  {new Date(s.timestamp).toLocaleString()}
                </div>
              </div>
              <span className={`badge badge-${s.decision === "paper_copy" ? "copy" : s.decision}`}>
                {s.decision === "pending" ? "Pending" : s.decision}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3 text-xs">
              <div>
                <div className="text-muted">Wallet's entry price</div>
                <div>{formatPrice(s.walletEntryPrice)}</div>
              </div>
              <div>
                <div className="text-muted">Detected price</div>
                <div>{formatPrice(s.detectedPrice)}</div>
              </div>
              <div>
                <div className="text-muted">Copy score</div>
                <div>{s.copyScore !== null ? `${(s.copyScore * 100).toFixed(0)} / 100` : "Not yet scored"}</div>
              </div>
            </div>
            {(s.reasons.length > 0 || s.risks.length > 0) && (
              <div className="mt-3 text-xs space-y-1">
                {s.reasons.map((r: string, i: number) => (
                  <div key={`r${i}`} className="text-accent">✓ {r}</div>
                ))}
                {s.risks.map((r: string, i: number) => (
                  <div key={`k${i}`} className="text-danger">⚠ {r}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
