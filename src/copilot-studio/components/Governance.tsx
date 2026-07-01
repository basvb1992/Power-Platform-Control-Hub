/**
 * Governance & risk panel — the CoE control view. Surfaces orphaned, stale,
 * unpublished, unauthenticated, failing, and premium-connector agents so a
 * platform team can act. All logic lives in lib/governance.ts (unit-tested).
 */
import { useMemo, useState } from "react";
import type { RunInfo } from "../lib/costEngine";
import type { AgentInventoryItem } from "../lib/data";
import type { ConnectionRef } from "../lib/connections";
import {
  buildGovernance,
  type AgentGovernance,
  type Severity,
} from "../lib/governance";

const SEV_META: Record<Severity, { label: string; cls: string }> = {
  high: { label: "High", cls: "sev-high" },
  medium: { label: "Medium", cls: "sev-med" },
  low: { label: "Low", cls: "sev-low" },
};

const CATEGORY_HINT: Record<string, string> = {
  Orphaned: "Reassign an owner so someone is accountable.",
  Unpublished: "Publish the agent or remove the draft.",
  Stale: "Review and republish, or retire if unused.",
  Inactive: "No traffic — confirm it is still needed.",
  "No authentication": "Add authentication before exposing data.",
  "High failure rate": "Investigate failing steps and tools.",
  "Premium connector": "Confirm premium licensing is in place.",
};

export function GovernancePanel({
  items,
  runs,
  connRefs,
}: {
  items: AgentInventoryItem[];
  runs: RunInfo[];
  connRefs: ConnectionRef[];
}) {
  const gov = useMemo(() => buildGovernance(items, runs, connRefs), [items, runs, connRefs]);
  const [filter, setFilter] = useState<Severity | "all" | "clean">("all");
  const [cat, setCat] = useState<string | null>(null);

  if (!items.length)
    return (
      <div className="card">
        <p className="muted">No agents found (or still loading).</p>
      </div>
    );

  const visible = gov.agents.filter((a) => {
    if (cat && !a.findings.some((f) => f.category === cat)) return false;
    if (filter === "all") return true;
    if (filter === "clean") return a.findings.length === 0;
    return a.findings.some((f) => f.severity === filter);
  });

  const categories = Object.entries(gov.byCategory).sort((a, b) => b[1] - a[1]);
  const active = filter !== "all" || cat !== null;
  const clearAll = () => { setFilter("all"); setCat(null); };


  return (
    <>
      <div className="card">
        <h2>Governance &amp; risk</h2>
        <p className="muted">
          Automated checks across the fleet — ownership, freshness, authentication, reliability,
          and premium-connector exposure. Highest-risk agents first.
        </p>
        <div className="stats">
          <button
            className={`stat sevpick ${filter === "high" ? "on" : ""}`}
            onClick={() => setFilter(filter === "high" ? "all" : "high")}
          >
            <div className="v sev-high-txt">{gov.high}</div>
            <div className="l">High findings</div>
          </button>
          <button
            className={`stat sevpick ${filter === "medium" ? "on" : ""}`}
            onClick={() => setFilter(filter === "medium" ? "all" : "medium")}
          >
            <div className="v sev-med-txt">{gov.medium}</div>
            <div className="l">Medium findings</div>
          </button>
          <button
            className={`stat sevpick ${filter === "low" ? "on" : ""}`}
            onClick={() => setFilter(filter === "low" ? "all" : "low")}
          >
            <div className="v sev-low-txt">{gov.low}</div>
            <div className="l">Low findings</div>
          </button>
          <button
            className={`stat sevpick ${filter === "clean" ? "on" : ""}`}
            onClick={() => setFilter(filter === "clean" ? "all" : "clean")}
          >
            <div className="v sev-good-txt">{gov.clean}</div>
            <div className="l">Clean agents</div>
          </button>
        </div>
        {categories.length > 0 && (
          <div className="pillrow" style={{ marginTop: 12 }}>
            {categories.map(([c, n]) => (
              <button
                className={`pill kind catpick ${cat === c ? "on" : ""}`}
                key={c}
                title={CATEGORY_HINT[c] ?? ""}
                onClick={() => setCat(cat === c ? null : c)}
              >
                {c}: {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex-between" style={{ alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>
            Agents ({visible.length}
            {active ? ` of ${gov.agents.length}` : ""})
          </h2>
          {active && (
            <button className="linkbtn" onClick={clearAll}>Clear filters</button>
          )}
        </div>
        {visible.length === 0 ? (
          <p className="muted">No agents match this filter.</p>
        ) : (
          <div className="gov-list">
            {visible.map((a) => (
              <GovRow key={a.botid} a={a} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function GovRow({ a }: { a: AgentGovernance }) {
  const top: Severity = a.findings.some((f) => f.severity === "high")
    ? "high"
    : a.findings.some((f) => f.severity === "medium")
      ? "medium"
      : a.findings.length
        ? "low"
        : "low";
  const clean = a.findings.length === 0;

  return (
    <div className={`gov-row ${clean ? "gov-clean" : SEV_META[top].cls}`}>
      <div className="gov-head">
        <div>
          <div className="gov-name">{a.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{a.schemaname}</div>
        </div>
        <div className="gov-meta">
          <span className="muted">{a.owner || "no owner"}</span>
          <span className="muted">{a.conversations} conv.</span>
          {a.failRate !== null && (
            <span className="muted">{Math.round(a.failRate * 100)}% fail</span>
          )}
          {clean ? (
            <span className="pill ok">No findings</span>
          ) : (
            <span className={`pill score ${SEV_META[top].cls}`}>risk {a.score}</span>
          )}
        </div>
      </div>
      {a.findings.length > 0 && (
        <ul className="gov-findings">
          {a.findings.map((f, i) => (
            <li key={i} className={SEV_META[f.severity].cls}>
              <span className="sev-tag">{SEV_META[f.severity].label}</span>
              <strong>{f.category}</strong> — {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
