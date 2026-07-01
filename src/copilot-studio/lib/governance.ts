/**
 * Governance + risk scoring for the agent fleet. Pure functions over already
 * loaded data (inventory, runs, connection references) so the panel and the
 * unit tests share the exact same logic.
 *
 * A "finding" is one governance concern about a single agent. Each carries a
 * severity; an agent's risk score is the weighted sum of its findings.
 */
import { isFailedStep, type RunInfo } from "./costEngine";
import type { AgentInventoryItem } from "./data";
import { isPremiumConnector, connectorLabel, refsForAgent, type ConnectionRef } from "./connections";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  severity: Severity;
  category: string;
  message: string;
}

export interface AgentGovernance {
  botid: string;
  name: string;
  schemaname: string;
  owner: string;
  state: string;
  conversations: number;
  failRate: number | null;
  findings: Finding[];
  score: number;
}

export interface GovernanceSummary {
  agents: AgentGovernance[];
  byCategory: Record<string, number>;
  high: number;
  medium: number;
  low: number;
  clean: number;
}

export interface GovernanceThresholds {
  /** Days since published before an agent is considered stale. */
  staleAfterDays: number;
  /** Step failure rate (0-1) above which an agent is flagged unhealthy. */
  failRateHigh: number;
  /** Minimum conversations before failure rate is judged (avoid noise). */
  minRunsForFailRate: number;
  /** "Now" for stale calculations (injectable for tests). */
  now: Date;
}

export const DEFAULT_THRESHOLDS: GovernanceThresholds = {
  staleAfterDays: 30,
  failRateHigh: 0.25,
  minRunsForFailRate: 3,
  now: new Date(),
};

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/** True when an owner string is missing / a placeholder. */
export function isOrphaned(owner: string): boolean {
  const o = (owner || "").trim().toLowerCase();
  return o === "" || o === "—" || o === "unknown" || o === "system";
}

/** True when an auth mode string indicates no end-user authentication. */
export function isNoAuth(authMode: string): boolean {
  return /\bno\b|none|nessuna|geen|sans/i.test(authMode || "");
}

/** Whole days between two ISO dates (a - b), or null if unparseable. */
export function daysBetween(aIso: string, b: Date): number | null {
  if (!aIso) return null;
  const t = Date.parse(aIso);
  if (Number.isNaN(t)) return null;
  return Math.floor((b.getTime() - t) / 86_400_000);
}

/** Runs belonging to one agent (schema match, fallback to display name). */
export function runsForAgent(runs: RunInfo[], item: AgentInventoryItem): RunInfo[] {
  const schema = (item.schemaname || "").toLowerCase();
  return runs.filter(
    (r) => r.agentSchema.toLowerCase() === schema || r.agentLabel === item.name
  );
}

/** Step failure rate across an agent's runs, or null when there are no steps. */
export function failRateOf(runs: RunInfo[]): number | null {
  let total = 0;
  let failed = 0;
  for (const r of runs) {
    for (const s of r.steps) {
      total++;
      if (isFailedStep(s)) failed++;
    }
  }
  return total === 0 ? null : failed / total;
}

/** Compute the governance findings for a single agent. */
export function evaluateAgent(
  item: AgentInventoryItem,
  runs: RunInfo[],
  connRefs: ConnectionRef[],
  thresholds: GovernanceThresholds = DEFAULT_THRESHOLDS
): AgentGovernance {
  const findings: Finding[] = [];
  const agentRuns = runsForAgent(runs, item);
  const failRate = failRateOf(agentRuns);
  const active = /active|published|^\s*1\s*$/i.test(item.state);

  if (isOrphaned(item.owner)) {
    findings.push({
      severity: "high",
      category: "Orphaned",
      message: "No owner assigned — nobody accountable for this agent.",
    });
  }

  if (!item.publishedon) {
    findings.push({
      severity: "medium",
      category: "Unpublished",
      message: "Never published — exists only in draft.",
    });
  } else {
    const age = daysBetween(item.publishedon, thresholds.now);
    if (age !== null && age > thresholds.staleAfterDays) {
      findings.push({
        severity: "medium",
        category: "Stale",
        message: `Last published ${age} days ago (> ${thresholds.staleAfterDays}d).`,
      });
    }
  }

  if (active && agentRuns.length === 0) {
    findings.push({
      severity: "low",
      category: "Inactive",
      message: "Published but no conversations in the loaded window.",
    });
  }

  if (isNoAuth(item.authMode)) {
    findings.push({
      severity: "medium",
      category: "No authentication",
      message: "No end-user authentication configured.",
    });
  }

  if (
    failRate !== null &&
    agentRuns.length >= thresholds.minRunsForFailRate &&
    failRate > thresholds.failRateHigh
  ) {
    findings.push({
      severity: "high",
      category: "High failure rate",
      message: `${Math.round(failRate * 100)}% of steps failing across ${agentRuns.length} conversations.`,
    });
  }

  const premium = refsForAgent(connRefs, item.schemaname).filter((r) =>
    isPremiumConnector(r.connectorId)
  );
  if (premium.length > 0) {
    const labels = [...new Set(premium.map((r) => connectorLabel(r.connectorId)))];
    findings.push({
      severity: "low",
      category: "Premium connector",
      message: `Uses premium connector${labels.length > 1 ? "s" : ""}: ${labels.join(", ")}.`,
    });
  }

  const score = findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);

  return {
    botid: item.botid,
    name: item.name,
    schemaname: item.schemaname,
    owner: item.owner,
    state: item.state,
    conversations: agentRuns.length,
    failRate,
    findings,
    score,
  };
}

/** Evaluate the whole fleet and roll up severity + category counts. */
export function buildGovernance(
  items: AgentInventoryItem[],
  runs: RunInfo[],
  connRefs: ConnectionRef[],
  thresholds: GovernanceThresholds = DEFAULT_THRESHOLDS
): GovernanceSummary {
  const agents = items
    .map((it) => evaluateAgent(it, runs, connRefs, thresholds))
    .sort((a, b) => b.score - a.score);

  const byCategory: Record<string, number> = {};
  let high = 0;
  let medium = 0;
  let low = 0;
  let clean = 0;
  for (const a of agents) {
    if (a.findings.length === 0) clean++;
    for (const f of a.findings) {
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
      if (f.severity === "high") high++;
      else if (f.severity === "medium") medium++;
      else low++;
    }
  }

  return { agents, byCategory, high, medium, low, clean };
}
