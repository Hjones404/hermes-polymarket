"use client";

import { useEffect, useState } from "react";

export default function DecisionJournalPage() {
  const [decisions, setDecisions] = useState<any[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/decisions")
      .then((r) => r.json())
      .then(setDecisions);
  }, []);

  if (!decisions) return <div className="text-muted">Loading...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Decision Journal</h1>
        <p className="text-muted text-sm mt-1">Every copy / watchlist / skip decision, its score breakdown, and what was learned.</p>
      </div>

      <div className="space-y-2">
        {decisions.map((d) => (
          <div key={d.id} className="card p-4 cursor-pointer" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">{d.marketQuestion}</div>
                <div className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-3">
                {d.wasDecisionGood !== null && (
                  <span className={d.wasDecisionGood ? "text-accent text-xs" : "text-danger text-xs"}>
                    {d.wasDecisionGood ? "Good call" : "Bad call"}
                  </span>
                )}
                <span className={`badge badge-${d.decision === "paper_copy" ? "copy" : d.decision}`}>{d.decision}</span>
              </div>
            </div>
            {expanded === d.id && (
              <div className="mt-4 space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(d.breakdown).map(([k, v]: any) => (
                    <div key={k}>
                      <div className="text-muted">{k}</div>
                      <div>{(Number(v) * 100).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-muted mb-1">Reasons</div>
                  {d.reasons.map((r: string, i: number) => (
                    <div key={i} className="text-accent">✓ {r}</div>
                  ))}
                </div>
                <div>
                  <div className="text-muted mb-1">Risks</div>
                  {d.risks.map((r: string, i: number) => (
                    <div key={i} className="text-danger">⚠ {r}</div>
                  ))}
                </div>
                {d.lessons.length > 0 && (
                  <div>
                    <div className="text-muted mb-1">Lessons learned</div>
                    {d.lessons.map((l: string, i: number) => (
                      <div key={i}>💡 {l}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
