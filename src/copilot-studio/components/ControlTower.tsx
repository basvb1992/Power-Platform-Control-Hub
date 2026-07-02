/**
 * Control Tower — the executive landing for the Agent Operations Center.
 * Fuses fleet health, open governance risk, cost-vs-budget and a "needs
 * attention" inbox into one at-a-glance control plane, with click-through to
 * the deep-dive tabs. Pure read; all numbers derive from already-loaded data.
 */
import { useMemo } from "react";
import type { RunInfo, AgentRollup, Totals, CostModel } from "../lib/costEngine";
import type { AgentInventoryItem } from "../lib/data";
import type { ConnectionRef } from "../lib/connections";
import { isPremiumConnector } from "../lib/connections";
import { buildGovernance, type GovernanceSummary } from "../lib/governance";
import { money } from "../lib/format";

export type TowerNav =
  | "agents"
  | "conversations"
  | "connections"
  | "governance"
  | "overview";

interface InboxItem {
  severity: "high" | "medium" | "low";
  icon: string;
  text: string;
  nav: TowerNav;
  cta: string;
}

/** 0-100 fleet health: starts at 100, deducts for risk signals. */
function healthScore(
  gov: GovernanceSummary,
  t: Totals | null,
  agentCount: number
): number {
  if (agentCount === 0) return 100;
  let score = 100;
  score -= Math.min(40, gov.high * 8); // high findings hurt most
  score -= Math.min(20, gov.medium * 3);
  score -= Math.min(10, gov.low * 1);
  if (t && t.completed + t.failed > 0) {
    const failRate = t.failed / (t.completed + t.failed);
    score -= Math.min(20, failRate * 100); // up to -20 for failures
  }
  return Math.max(0, Math.round(score));
}

function healthBand(score: number): { label: string; cls: string } {
  if (score >= 85) return { label: "Healthy", cls: "ring-good" };
  if (score >= 60) return { label: "Watch", cls: "ring-warn" };
  return { label: "At risk", cls: "ring-bad" };
}

export function ControlTower({
  items,
  runs,
  byAgent,
  totals: t,
  model,
  connRefs,
  budget,
  hasLoaded,
  onNavigate,
}: {
  items: AgentInventoryItem[];
  runs: RunInfo[];
  byAgent: AgentRollup[];
  totals: Totals | null;
  model: CostModel;
  connRefs: ConnectionRef[];
  budget: number;
  hasLoaded: boolean;
  onNavigate: (tab: TowerNav) => void;
}) {
  const gov = useMemo(() => buildGovernance(items, runs, connRefs), [items, runs, connRefs]);

  const activeAgents = items.filter((b) => b.state === "Active").length;
  const owners = new Set(items.map((b) => b.owner).filter(Boolean)).size;
  const premiumRefs = connRefs.filter((r) => isPremiumConnector(r.connectorId)).length;
  const orphaned = gov.byCategory["Orphaned"] ?? 0;
  const stale = (gov.byCategory["Stale"] ?? 0) + (gov.byCategory["Inactive"] ?? 0);

  const score = healthScore(gov, t, items.length);
  const band = healthBand(score);

  const usedCredits = t?.credits ?? 0;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((usedCredits / budget) * 100)) : null;
  const overBudget = budget > 0 && usedCredits > budget;

  const failRate =
    t && t.completed + t.failed > 0 ? (t.failed / (t.completed + t.failed)) * 100 : null;

  const inbox = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [];
    for (const a of gov.agents) {
      const high = a.findings.find((f) => f.severity === "high");
      if (high) {
        out.push({
          severity: "high",
          icon: "🔴",
          text: `${a.name}: ${high.category} — ${high.message}`,
          nav: "governance",
          cta: "Review",
        });
      }
    }
    if (overBudget) {
      out.push({
        severity: "high",
        icon: "💸",
        text: `Budget exceeded — ${money(usedCredits, model)} used of ${money(budget, model)}.`,
        nav: "overview",
        cta: "Open cost",
      });
    }
    if (orphaned > 0) {
      out.push({
        severity: "medium",
        icon: "👤",
        text: `${orphaned} agent${orphaned > 1 ? "s" : ""} without an owner.`,
        nav: "agents",
        cta: "Assign",
      });
    }
    if (premiumRefs > 0) {
      out.push({
        severity: "low",
        icon: "🔌",
        text: `${premiumRefs} premium connector reference${premiumRefs > 1 ? "s" : ""} in use.`,
        nav: "connections",
        cta: "Inspect",
      });
    }
    if (stale > 0) {
      out.push({
        severity: "medium",
        icon: "🕸",
        text: `${stale} stale or inactive agent${stale > 1 ? "s" : ""}.`,
        nav: "governance",
        cta: "Review",
      });
    }
    const order = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
  }, [gov.agents, overBudget, usedCredits, budget, model, orphaned, premiumRefs, stale]);

  const topSpenders = byAgent.slice(0, 5);

  return (
    <div role="tabpanel" id="panel-tower" aria-labelledby="tab-tower">
      {/* Health banner */}
      <section className="tower-hero">
        <div className={`health-ring ${band.cls}`} style={{ ["--score" as string]: score }}>
          <div className="ring-inner">
            <div className="ring-score">{score}</div>
            <div className="ring-label">{band.label}</div>
          </div>
        </div>
        <div className="tower-hero-body">
          <h2>Fleet control tower</h2>
          <p className="muted">
            {items.length} agents · {activeAgents} active · {owners} owners
            {hasLoaded ? ` · ${runs.length} conversations in window` : " · load a window for live cost & health"}
          </p>
          <div className="tower-kpis">
            <button className="tkpi" onClick={() => onNavigate("governance")}>
              <span className="tkpi-v sev-high-txt">{gov.high}</span>
              <span className="tkpi-l">High risks</span>
            </button>
            <button className="tkpi" onClick={() => onNavigate("governance")}>
              <span className="tkpi-v sev-med-txt">{gov.medium}</span>
              <span className="tkpi-l">Medium risks</span>
            </button>
            <button className="tkpi" onClick={() => onNavigate("governance")}>
              <span className="tkpi-v sev-good-txt">{gov.clean}</span>
              <span className="tkpi-l">Clean agents</span>
            </button>
            <div className="tkpi">
              <span className="tkpi-v">{failRate === null ? "—" : `${failRate.toFixed(1)}%`}</span>
              <span className="tkpi-l">Step failure rate</span>
            </div>
            <div className="tkpi">
              <span className="tkpi-v">{usedCredits.toLocaleString()}</span>
              <span className="tkpi-l">Credits used</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid-2">
        {/* Needs attention inbox */}
        <div className="card">
          <h2>Needs attention</h2>
          {inbox.length === 0 ? (
            <p className="muted">
              {hasLoaded
                ? "Nothing flagged — the fleet looks healthy."
                : "Load a date window to surface live findings."}
            </p>
          ) : (
            <ul className="inbox">
              {inbox.map((it, i) => (
                <li key={i} className={`inbox-row sev-${it.severity}`}>
                  <span className="inbox-ico" aria-hidden>{it.icon}</span>
                  <span className="inbox-text">{it.text}</span>
                  <button className="btn tiny" onClick={() => onNavigate(it.nav)}>
                    {it.cta}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cost vs budget */}
        <div className="card">
          <h2>Cost vs budget</h2>
          {budget > 0 ? (
            <>
              <div className="bigstat">
                <span className={overBudget ? "err" : ""}>{money(usedCredits, model)}</span>
                <span className="muted"> / {money(budget, model)}</span>
              </div>
              <div className="bar" style={{ marginTop: 10 }}>
                <span
                  style={{
                    width: `${budgetPct}%`,
                    background: overBudget ? "var(--cp-danger)" : "var(--cp-accent)",
                  }}
                />
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                {budgetPct}% of budget used{overBudget ? " — over limit" : ""}.
              </p>
            </>
          ) : (
            <p className="muted">
              Set a budget on the Overview tab to track burn here.
            </p>
          )}
          <div className="bigstat" style={{ marginTop: 16 }}>
            {usedCredits.toLocaleString()} <span className="muted">credits this window</span>
          </div>
        </div>
      </div>

      {/* Top spenders */}
      <div className="card">
        <div className="card-head">
          <h2>Top spenders</h2>
          <button className="btn secondary tiny" onClick={() => onNavigate("agents")}>
            All agents
          </button>
        </div>
        {topSpenders.length === 0 ? (
          <p className="muted">No cost data yet — load a window.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Conversations</th>
                <th className="num">Failed steps</th>
                <th className="num">Credits</th>
              </tr>
            </thead>
            <tbody>
              {topSpenders.map((a) => (
                <tr key={a.key}>
                  <td>{a.label}</td>
                  <td className="num">{a.transcripts}</td>
                  <td className="num">{a.failed || "—"}</td>
                  <td className="num">
                    {a.credits.toLocaleString()}
                    {model.pricePerCredit > 0 && (
                      <span className="muted"> · {money(a.credits, model)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
