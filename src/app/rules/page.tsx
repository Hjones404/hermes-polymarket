"use client";

import { useEffect, useState } from "react";

export default function RulesPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Rules</h1>
        <p className="text-muted text-sm mt-1">Active scoring thresholds and every automatic change Hermes has made, with reasons.</p>
      </div>

      {data.active && (
        <div className="card p-4">
          <div className="text-sm text-muted mb-3">Active rule set — v{data.active.version}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {Object.entries(data.active.rules)
              .filter(([k]) => k !== "weights" && k !== "version")
              .map(([k, v]: any) => (
                <div key={k}>
                  <div className="text-muted">{k}</div>
                  <div>{typeof v === "number" ? v : JSON.stringify(v)}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="text-sm text-muted mb-3">Rule change history</div>
        {data.changes.length === 0 ? (
          <div className="text-muted text-sm">No automatic rule changes yet.</div>
        ) : (
          <div className="space-y-4">
            {data.changes.map((c: any, i: number) => (
              <div key={i} className="border-b border-border pb-3 last:border-0">
                <div className="text-sm">{c.reason}</div>
                <div className="text-xs text-muted mt-1">{c.evidenceSummary}</div>
                <div className="text-xs text-muted mt-1">
                  v{c.fromVersion ?? "—"} → v{c.toVersion} · {new Date(c.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
