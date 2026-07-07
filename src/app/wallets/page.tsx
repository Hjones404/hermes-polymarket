"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Wallet {
  address: string;
  label?: string;
  sourceRank?: number;
  globalScore: number;
  roi30d: number;
  consistencyScore: number;
  copyabilityScore: number;
  oneHitWonderPenalty: number;
  bestCategory?: string;
  status: string;
  copyabilityNotes: string;
  riskNotes: string;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default function WalletRankingsPage() {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/wallets")
      .then((r) => r.json())
      .then(setWallets);
  }, []);

  if (!wallets) return <div className="text-muted">Loading...</div>;
  const filtered = filter === "all" ? wallets : wallets.filter((w) => w.status === filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Wallet Rankings</h1>
        <p className="text-muted text-sm mt-1">Top {wallets.length} scanned wallets, ranked by global score.</p>
      </div>

      <div className="flex gap-2 text-sm">
        {["all", "track", "watch", "ignore"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full border ${filter === s ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase border-b border-border">
              <th className="text-left p-3">Wallet</th>
              <th className="text-left p-3">Rank</th>
              <th className="text-left p-3">ROI 30d</th>
              <th className="text-left p-3">Consistency</th>
              <th className="text-left p-3">Copyability</th>
              <th className="text-left p-3">1-Hit Penalty</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr key={w.address} className="border-b border-border last:border-0 hover:bg-panel2">
                <td className="p-3">
                  <Link href={`/wallets/${w.address}`} className="text-accent hover:underline">
                    {w.label || `${w.address.slice(0, 8)}...${w.address.slice(-4)}`}
                  </Link>
                </td>
                <td className="p-3">{w.sourceRank ?? "—"}</td>
                <td className={`p-3 ${w.roi30d >= 0 ? "text-accent" : "text-danger"}`}>{(w.roi30d * 100).toFixed(1)}%</td>
                <td className="p-3">{(w.consistencyScore * 100).toFixed(0)}</td>
                <td className="p-3">{(w.copyabilityScore * 100).toFixed(0)}</td>
                <td className="p-3">{w.oneHitWonderPenalty > 0 ? `-${(w.oneHitWonderPenalty * 100).toFixed(0)}` : "—"}</td>
                <td className="p-3">{w.bestCategory ?? "—"}</td>
                <td className="p-3">
                  <StatusBadge status={w.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
