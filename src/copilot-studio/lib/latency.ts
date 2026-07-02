/**
 * Latency inspector — reconstructs per-turn timing and bottlenecks from Copilot
 * Studio conversation transcripts.
 *
 * The timing signal lives in the same `conversationtranscript` rows the cost
 * engine already reads. Orchestrated (autonomous / multi-agent) agents emit a
 * plan-step lifecycle we can time to the millisecond:
 *   DynamicPlanReceived        — the orchestrator produced/updated a plan
 *   DynamicPlanStepTriggered   — a step started (stepId, taskDialogId, thought)
 *   DynamicPlanStepBindUpdate  — arguments bound
 *   DynamicPlanStepFinished    — step ended (executionTime, displayedCost, state)
 * Every activity carries `timestampMs` (epoch ms) plus `timestamp` (epoch s).
 * We pair Triggered↔Finished by `stepId` to get each step's wall-clock wait,
 * split it into actual execution (`executionTime`) vs. queue/overhead, and treat
 * the time *between* steps as model / orchestration "thinking". From that we flag
 * the slowest step, the biggest idle gap, and emit improvement suggestions.
 *
 * Caveat: only orchestrated-agent transcripts carry step timing. Classic / simple
 * ("cliagent") transcripts have no per-step timestamps — such runs are reported
 * with `hasTiming = false` and excluded from the fleet timing views.
 *
 * Heuristics adapted (MIT) from Roel Schenk's mcs-agent-analyser
 * (https://github.com/Roelzz/mcs-agent-analyser) — timeline & latency-bottleneck
 * analysis — re-implemented natively in TypeScript so the app stays self-contained.
 */

import { classifyTool, humanize, type RunInfo } from "./costEngine.ts";

/* --------------------------------------------------------------- thresholds */

/** A single step whose wall-clock wait exceeds this is called out as slow. */
export const SLOW_STEP_MS = 5000;
/** A step whose actual execution exceeds this is a slow tool / query. */
export const SLOW_EXEC_MS = 3000;
/** A single idle gap between steps larger than this is a re-planning bottleneck. */
export const BIG_GAP_MS = 8000;
/** A turn longer than this counts as a "slow run" in fleet rollups. */
export const SLOW_TURN_MS = 15000;
/** More tool calls than this in one turn is worth consolidating. */
export const MANY_STEPS = 8;

/* ------------------------------------------------------------------- types */

export interface LatencyStep {
  index: number;
  stepId: string;
  /** taskDialogId (raw tool identifier). */
  tool: string;
  /** Humanized tool label. */
  toolLabel: string;
  /** classifyTool() result: Action / Knowledge / Connected agent / Other / Step. */
  kind: string;
  state: string;
  cost: number;
  startMs: number;
  endMs: number;
  /** Wall-clock time the step occupied (endMs - startMs). */
  waitMs: number;
  /** Actual execution time reported by executionTime. */
  execMs: number;
  /** waitMs - execMs: queue / binding / orchestration overhead around the step. */
  overheadMs: number;
  /** Idle time (model thinking) immediately before this step started. */
  gapBeforeMs: number;
  thought: string;
  failed: boolean;
}

export interface LatencyBucket {
  label: string;
  ms: number;
  cls: string;
}

export type LatencySeverity = "high" | "med" | "low";

export interface LatencySuggestion {
  severity: LatencySeverity;
  title: string;
  detail: string;
  /** Optional taskDialogId the suggestion is about (for deep-linking to the tool/flow). */
  tool?: string;
}

export interface LatencyProfile {
  /** False when the transcript carries no usable per-step timing (classic agents). */
  hasTiming: boolean;
  /** Wall-clock duration of the turn / conversation. */
  totalMs: number;
  steps: LatencyStep[];
  buckets: LatencyBucket[];
  toolMs: number;
  knowledgeMs: number;
  overheadMs: number;
  /** Time not spent inside any step — model / orchestration reasoning. */
  thinkingMs: number;
  thinkingPct: number;
  slowestStepIndex: number;
  biggestGapMs: number;
  /** Step index the biggest idle gap follows (-1 = before the first step). */
  biggestGapAfterIndex: number;
  suggestions: LatencySuggestion[];
}

/* --------------------------------------------------------------- utilities */

/** Parse a .NET TimeSpan string ("[d.]hh:mm:ss[.fffffff]") into milliseconds. */
export function parseTimeSpanMs(ts: unknown): number {
  if (typeof ts !== "string") return 0;
  const m = ts.match(/^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return 0;
  const [, d, hh, mm, ss, frac] = m;
  let ms = (d ? Number(d) : 0) * 86_400_000;
  ms += Number(hh) * 3_600_000;
  ms += Number(mm) * 60_000;
  ms += Number(ss) * 1_000;
  if (frac) ms += Math.round(Number("0." + frac) * 1000);
  return ms;
}

/** Best-effort epoch-ms for an activity (prefers timestampMs, falls back to timestamp). */
function tsOf(act: Record<string, unknown>): number {
  const ms = act.timestampMs;
  if (typeof ms === "number" && Number.isFinite(ms)) return ms;
  if (typeof ms === "string" && ms.trim() !== "" && Number.isFinite(Number(ms))) return Number(ms);
  const s = act.timestamp;
  if (typeof s === "number" && Number.isFinite(s)) return s * 1000;
  if (typeof s === "string") {
    const n = Number(s);
    if (Number.isFinite(n)) return n * 1000;
    const parsed = new Date(s).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

/** Human-readable duration. */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((q, r) => q - r);
  const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[idx];
}

/* --------------------------------------------------------------- profiling */

/**
 * Build a latency profile from a transcript's `activities` array. Returns null
 * when there is nothing to analyze (no plan steps).
 */
export function buildLatencyProfile(activities: unknown[]): LatencyProfile | null {
  if (!Array.isArray(activities) || activities.length === 0) return null;

  const triggers = new Map<string, { startMs: number; thought: string; tool: string }>();
  const finishes: {
    stepId: string;
    endMs: number;
    tool: string;
    execMs: number;
    cost: number;
    state: string;
    thought: string;
  }[] = [];
  let firstMs = NaN;
  let lastMs = NaN;
  let sawTimestampMs = false;

  for (const a of activities) {
    const act = (a ?? {}) as Record<string, unknown>;
    const ts = tsOf(act);
    if (Number.isFinite(ts)) {
      if (!Number.isFinite(firstMs) || ts < firstMs) firstMs = ts;
      if (!Number.isFinite(lastMs) || ts > lastMs) lastMs = ts;
    }
    if (typeof act.timestampMs === "number") sawTimestampMs = true;

    const name = String(act.name || "");
    const v = (act.value as Record<string, unknown>) || {};

    if (name === "DynamicPlanStepTriggered") {
      const stepId = String(v.stepId || "");
      if (stepId && !triggers.has(stepId)) {
        const rawThought = v.thought ?? "";
        triggers.set(stepId, {
          startMs: ts,
          thought: typeof rawThought === "string" ? rawThought : "",
          tool: String(v.taskDialogId || ""),
        });
      }
    } else if (name === "DynamicPlanStepFinished" || v.displayedCost !== undefined) {
      const rawThought = v.thought ?? v.observation ?? "";
      finishes.push({
        stepId: String(v.stepId || ""),
        endMs: ts,
        tool: String(v.taskDialogId || ""),
        execMs: parseTimeSpanMs(v.executionTime),
        cost: Number(v.displayedCost) || 0,
        state: String(v.state || ""),
        thought: typeof rawThought === "string" ? rawThought : "",
      });
    }
  }

  if (finishes.length === 0) return null;

  const steps: LatencyStep[] = finishes.map((f, i) => {
    const trig = f.stepId ? triggers.get(f.stepId) : undefined;
    const startMs = trig && Number.isFinite(trig.startMs) ? trig.startMs : f.endMs;
    const endMs = Number.isFinite(f.endMs) ? f.endMs : startMs;
    const waitMs = Math.max(0, endMs - startMs);
    const rawExec = f.execMs > 0 ? f.execMs : waitMs;
    const execMs = waitMs > 0 ? Math.min(rawExec, waitMs) : rawExec;
    const tool = f.tool || trig?.tool || "";
    return {
      index: i,
      stepId: f.stepId,
      tool,
      toolLabel: humanize(tool),
      kind: classifyTool(tool),
      state: f.state,
      cost: f.cost,
      startMs,
      endMs,
      waitMs,
      execMs,
      overheadMs: Math.max(0, waitMs - execMs),
      gapBeforeMs: 0,
      thought: (trig?.thought || f.thought || "").trim(),
      failed: String(f.state).toLowerCase() === "failed" || f.cost === 0,
    };
  });

  steps.sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  steps.forEach((s, i) => (s.index = i));

  const totalMs =
    Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs > firstMs ? lastMs - firstMs : NaN;

  // Idle gaps (model / orchestration thinking) around each step.
  let prevEnd = Number.isFinite(firstMs) ? firstMs : steps[0]?.startMs ?? NaN;
  let biggestGapMs = 0;
  let biggestGapAfterIndex = -1;
  for (const s of steps) {
    const gap =
      Number.isFinite(s.startMs) && Number.isFinite(prevEnd) ? Math.max(0, s.startMs - prevEnd) : 0;
    s.gapBeforeMs = gap;
    if (gap > biggestGapMs) {
      biggestGapMs = gap;
      biggestGapAfterIndex = s.index - 1;
    }
    if (Number.isFinite(s.endMs)) prevEnd = Math.max(prevEnd, s.endMs);
  }
  const trailingGap =
    Number.isFinite(lastMs) && Number.isFinite(prevEnd) ? Math.max(0, lastMs - prevEnd) : 0;
  if (trailingGap > biggestGapMs) {
    biggestGapMs = trailingGap;
    biggestGapAfterIndex = steps.length - 1;
  }

  const stepWallMs = steps.reduce((a, s) => a + s.waitMs, 0);
  const toolMs = steps
    .filter((s) => s.kind === "Action" || s.kind === "Connected agent")
    .reduce((a, s) => a + s.execMs, 0);
  const knowledgeMs = steps.filter((s) => s.kind === "Knowledge").reduce((a, s) => a + s.execMs, 0);
  const otherExecMs = steps
    .filter((s) => s.kind !== "Action" && s.kind !== "Connected agent" && s.kind !== "Knowledge")
    .reduce((a, s) => a + s.execMs, 0);
  const overheadMs = steps.reduce((a, s) => a + s.overheadMs, 0);
  const total = Number.isFinite(totalMs) ? totalMs : stepWallMs;
  const thinkingMs = Math.max(0, total - stepWallMs);
  const thinkingPct = total > 0 ? thinkingMs / total : 0;

  const distinctStarts = new Set(steps.map((s) => s.startMs).filter((x) => Number.isFinite(x)));
  const hasTiming =
    Number.isFinite(totalMs) &&
    totalMs > 0 &&
    (sawTimestampMs || steps.some((s) => s.waitMs > 0) || distinctStarts.size > 1);

  let slowestStepIndex = -1;
  let slowestWait = -1;
  for (const s of steps) {
    if (s.waitMs > slowestWait) {
      slowestWait = s.waitMs;
      slowestStepIndex = s.index;
    }
  }

  const buckets: LatencyBucket[] = [
    { label: "Model & orchestration", ms: thinkingMs, cls: "lat-think" },
    { label: "Tool execution", ms: toolMs, cls: "lat-tool" },
    { label: "Knowledge", ms: knowledgeMs, cls: "lat-knowledge" },
    { label: "Queue / overhead", ms: overheadMs + otherExecMs, cls: "lat-overhead" },
  ].filter((b) => b.ms > 0);

  const suggestions = buildSuggestions({
    steps,
    totalMs: total,
    thinkingMs,
    thinkingPct,
    biggestGapMs,
    biggestGapAfterIndex,
  });

  return {
    hasTiming,
    totalMs: total,
    steps,
    buckets,
    toolMs,
    knowledgeMs,
    overheadMs: overheadMs + otherExecMs,
    thinkingMs,
    thinkingPct,
    slowestStepIndex,
    biggestGapMs,
    biggestGapAfterIndex,
    suggestions,
  };
}

/* ------------------------------------------------------------ suggestions */

function buildSuggestions(p: {
  steps: LatencyStep[];
  totalMs: number;
  thinkingMs: number;
  thinkingPct: number;
  biggestGapMs: number;
  biggestGapAfterIndex: number;
}): LatencySuggestion[] {
  const out: LatencySuggestion[] = [];

  // Slow individual tool / knowledge executions.
  for (const s of p.steps) {
    if (s.execMs >= SLOW_EXEC_MS && (s.kind === "Action" || s.kind === "Connected agent")) {
      out.push({
        severity: s.execMs >= SLOW_STEP_MS ? "high" : "med",
        title: `Slow tool: ${s.toolLabel}`,
        detail: `Executed in ${fmtMs(s.execMs)}. Inspect the connector / agent flow it calls — filter server-side, return fewer rows/columns, and avoid unbounded list queries.`,
        tool: s.tool,
      });
    } else if (s.execMs >= SLOW_EXEC_MS && s.kind === "Knowledge") {
      out.push({
        severity: "med",
        title: "Slow knowledge search",
        detail: `Knowledge lookup took ${fmtMs(s.execMs)}. Scope or refine the knowledge sources and reduce the amount of grounding content to speed retrieval.`,
        tool: s.tool,
      });
    }
  }

  // Model / orchestration reasoning dominating the turn.
  if (p.thinkingMs >= BIG_GAP_MS && p.thinkingPct >= 0.5) {
    out.push({
      severity: "high",
      title: "Model reasoning is the bottleneck",
      detail: `${fmtMs(p.thinkingMs)} (${Math.round(
        p.thinkingPct * 100
      )}% of the turn) was spent planning between steps, not running tools. Consider a lighter answer model, fewer/clearer tools, or tighter agent instructions to cut planning time.`,
    });
  }

  // A single large idle gap = the orchestrator re-planned.
  if (p.biggestGapMs >= BIG_GAP_MS) {
    const after =
      p.biggestGapAfterIndex >= 0 && p.steps[p.biggestGapAfterIndex]
        ? `after "${p.steps[p.biggestGapAfterIndex].toolLabel}"`
        : "before the first step";
    out.push({
      severity: "med",
      title: "Long idle gap between steps",
      detail: `${fmtMs(
        p.biggestGapMs
      )} idle ${after}. Large gaps usually mean the model re-planned — simplify the plan, remove ambiguous/overlapping tools, or sharpen instructions so it commits to a plan sooner.`,
    });
  }

  // Too many steps in one turn.
  if (p.steps.length >= MANY_STEPS) {
    out.push({
      severity: "low",
      title: `${p.steps.length} tool calls in one turn`,
      detail:
        "Long tool chains add per-step orchestration overhead. Consolidate related lookups into a single flow/action where possible.",
    });
  }

  // Failed / retried steps waste latency.
  const failed = p.steps.filter((s) => s.failed);
  if (failed.length > 0) {
    const wasted = failed.reduce((a, s) => a + s.waitMs, 0);
    out.push({
      severity: "med",
      title: `${failed.length} failed / retried step${failed.length > 1 ? "s" : ""}`,
      detail: `Failed steps cost ~${fmtMs(
        wasted
      )} of wall-clock time before retrying. Fix the flaky tool or add guard conditions so the agent doesn't retry blindly.`,
      tool: failed[0].tool || undefined,
    });
  }

  const rank: Record<LatencySeverity, number> = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 6);
}

/* ------------------------------------------------------------- fleet views */

export interface LatencyAgentRollup {
  key: string;
  label: string;
  runs: number;
  medianTurnMs: number;
  p90TurnMs: number;
  avgThinkingPct: number;
  avgToolMs: number;
  slowestRunMs: number;
  slowRuns: number;
}

export interface LatencyFleetSummary {
  timedRuns: number;
  totalRuns: number;
  medianTurnMs: number;
  p90TurnMs: number;
  avgThinkingPct: number;
  slowestRunMs: number;
  slowRuns: number;
}

/** Runs that carry usable timing, newest first. */
export function timedRuns(runs: RunInfo[]): RunInfo[] {
  return runs.filter((r) => r.latency?.hasTiming);
}

export function latencyFleetSummary(runs: RunInfo[]): LatencyFleetSummary {
  const timed = timedRuns(runs);
  const turns = timed.map((r) => r.latency!.totalMs);
  return {
    timedRuns: timed.length,
    totalRuns: runs.length,
    medianTurnMs: median(turns),
    p90TurnMs: percentile(turns, 90),
    avgThinkingPct:
      timed.length > 0 ? timed.reduce((a, r) => a + r.latency!.thinkingPct, 0) / timed.length : 0,
    slowestRunMs: turns.reduce((a, x) => Math.max(a, x), 0),
    slowRuns: timed.filter((r) => r.latency!.totalMs >= SLOW_TURN_MS).length,
  };
}

export function latencyByAgent(runs: RunInfo[]): LatencyAgentRollup[] {
  const groups = new Map<string, RunInfo[]>();
  for (const r of timedRuns(runs)) {
    const key = r.agentLabel || r.agentSchema;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const rollups: LatencyAgentRollup[] = [];
  for (const [key, arr] of groups) {
    const turns = arr.map((r) => r.latency!.totalMs);
    rollups.push({
      key,
      label: key,
      runs: arr.length,
      medianTurnMs: median(turns),
      p90TurnMs: percentile(turns, 90),
      avgThinkingPct: arr.reduce((a, r) => a + r.latency!.thinkingPct, 0) / arr.length,
      avgToolMs: arr.reduce((a, r) => a + r.latency!.toolMs, 0) / arr.length,
      slowestRunMs: turns.reduce((a, x) => Math.max(a, x), 0),
      slowRuns: arr.filter((r) => r.latency!.totalMs >= SLOW_TURN_MS).length,
    });
  }
  return rollups.sort((a, b) => b.p90TurnMs - a.p90TurnMs);
}
