/**
 * Cost engine — reconstructs Copilot Credit consumption from Copilot Studio
 * conversation transcripts.
 *
 * Source of truth: every plan step in a transcript carries a `displayedCost`,
 * which is the exact number of Copilot Credits Microsoft metered for that step,
 * at the official per-message rates (Microsoft Learn — "Billing rates and
 * management"):
 *   classic answer 1 · generative answer 2 · agent action 5 ·
 *   tenant graph grounding 10 · agent flow 13 per 100 actions ·
 *   text & generative AI tools (premium/reasoning) 10 credits / 1,000 tokens.
 * A failed step costs 0. Run cost = sum of `displayedCost` across the transcript
 * — never a flat per-step assumption, so totals line up with what each
 * conversation shows and with Microsoft's own metering.
 *
 * Caveat: token-metered premium reasoning credits are billed by the model and
 * may not always be recorded in the transcript, so figures are the best
 * transcript-based estimate; reconcile actuals in PPAC → Copilot Studio.
 */

import { classifyModel, type ModelTier } from "./models.ts";
import { buildLatencyProfile, type LatencyProfile } from "./latency.ts";

export interface StepInfo {
  tool: string;
  state: string;
  cost: number;
  kind: string;
  thought: string;
}

/** A single dialogue turn pulled from the transcript (for the conversation viewer). */
export interface ConversationMessage {
  role: "user" | "bot";
  text: string;
  timestamp: string;
}

export interface RunInfo {
  id: string;
  conversationId: string;
  createdon: string;
  agentSchema: string;
  agentLabel: string;
  steps: StepInfo[];
  engineCost: number;
  messages: ConversationMessage[];
  events: ConvEvent[];
  /** Per-turn timing profile (null when the transcript has no usable timing). */
  latency: LatencyProfile | null;
}

/** Ordered transcript event for the merged conversation timeline. */
export type ConvEvent =
  | { kind: "message"; message: ConversationMessage }
  | { kind: "step"; step: StepInfo };

export interface AgentRollup {
  key: string;
  label: string;
  transcripts: number;
  completed: number;
  failed: number;
  credits: number;
  /** Raw modelNameHint from the agent's configuration (empty when unknown). */
  model: string;
  /** Friendly model name (e.g. "Claude Sonnet 4.5"). */
  modelLabel: string;
  /** Billing tier of the model (basic / standard / premium). */
  modelTier: ModelTier;
  /** True when the agent's configured model is a deep-reasoning / premium model. */
  deepReasoning: boolean;
  /**
   * Heuristic estimate of premium reasoning tokens generated across the window.
   * Only populated for reasoning-tier agents (0 otherwise) — approximated from
   * the volume of reasoning + answer text in the transcripts, so it's a rough
   * order-of-magnitude figure, not billed actuals.
   */
  estPremiumTokens: number;
  /**
   * Heuristic estimate of the *credits* those premium tokens cost, at the
   * official 10 credits / 1,000 tokens rate. 0 unless the agent is reasoning-tier.
   * These are NOT included in `credits` (that meter isn't in the transcript).
   */
  estPremiumCredits: number;
}

export interface CostModel {
  /** Optional price per Copilot Credit for currency conversion (0 = show credits only). */
  pricePerCredit: number;
  currency: string;
}

export const DEFAULT_COST_MODEL: CostModel = {
  pricePerCredit: 0,
  currency: "€",
};

/** Official Copilot Studio credit rates (Microsoft Learn billing table). */
export type BotMap = Record<string, string>;
export function creditBreakdown(cost: number): { label: string; cr: number }[] {
  switch (cost) {
    case 7: return [{ label: "Agent action", cr: 5 }, { label: "Generative answer", cr: 2 }];
    case 5: return [{ label: "Agent action", cr: 5 }];
    case 2: return [{ label: "Generative answer", cr: 2 }];
    case 1: return [{ label: "Classic answer", cr: 1 }];
    case 10: return [{ label: "Tenant graph grounding", cr: 10 }];
    case 12: return [{ label: "Tenant graph grounding", cr: 10 }, { label: "Generative answer", cr: 2 }];
    case 13: return [{ label: "Agent flow", cr: 13 }];
    case 0: return [];
    default: return [{ label: "Mixed/other", cr: cost }];
  }
}

export function classifyTool(tool: string): string {
  if (/InvokeConnectedAgent/i.test(tool)) return "Connected agent";
  if (/UniversalSearchTool/i.test(tool)) return "Knowledge";
  if (/\.action\./i.test(tool)) return "Action";
  return tool ? "Other" : "Step";
}

/** Humanize a schema name: strip prefix, split camelCase, separate the agent suffix. */
export function humanize(schema: string): string {
  let s = String(schema).replace(/^[a-z0-9]+_/i, "");
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  s = s.replace(/([a-zA-Z])agent\b/gi, "$1 Agent");
  return s.trim() || String(schema);
}

export function agentLabel(schema: string, botMap: BotMap): string {
  if (!schema || schema === "(unknown)") return "(unknown)";
  return botMap[String(schema).toLowerCase()] || humanize(schema);
}

/** Pull the agent schema name out of a step's taskDialogId prefix. */
function inferSchema(steps: StepInfo[]): string {
  for (const s of steps) {
    const m = (s.tool || "").match(/^([a-z0-9]+_[A-Za-z0-9-]+)\./);
    if (m) return m[1];
  }
  return "(unknown)";
}

interface TranscriptRecord {
  conversationtranscriptid?: string;
  createdon?: string;
  content?: string;
  name?: string;
  bot_conversationtranscriptidname?: string;
}

/**
 * Parse one conversation transcript into a RunInfo. Returns null when the
 * transcript has no billable steps (plumbing-only rows).
 */
export function parseTranscript(rec: TranscriptRecord, botMap: BotMap): RunInfo | null {
  let content: unknown = rec.content;
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
      return null;
    }
  }
  const activities = (content as { activities?: unknown })?.activities;
  if (!Array.isArray(activities)) return null;

  const steps: StepInfo[] = [];
  const messages: ConversationMessage[] = [];
  const events: ConvEvent[] = [];
  for (const a of activities) {
    const act = (a ?? {}) as Record<string, unknown>;
    const v = (act.value as Record<string, unknown>) || {};
    const dc = v.displayedCost;
    if (dc !== undefined && dc !== null) {
      const tool = String(v.taskDialogId || "");
      const rawThought = v.thought ?? v.observation ?? "";
      const thought = typeof rawThought === "string" ? rawThought : JSON.stringify(rawThought);
      const step: StepInfo = {
        tool,
        state: String(v.state || ""),
        cost: Number(dc) || 0,
        kind: classifyTool(tool),
        thought: thought === "{}" || thought === "null" ? "" : thought,
      };
      steps.push(step);
      events.push({ kind: "step", step });
    }
    // Capture dialogue turns (type "message" with text) for the conversation viewer.
    if (act.type === "message") {
      const text = typeof act.text === "string" ? act.text.trim() : "";
      if (text) {
        const from = (act.from as Record<string, unknown>) || {};
        const role = String(from.role || "").toLowerCase() === "user" ? "user" : "bot";
        const message: ConversationMessage = { role, text, timestamp: String(act.timestamp || "") };
        messages.push(message);
        events.push({ kind: "message", message });
      }
    }
  }
  if (steps.length === 0) return null;

  const engineCost = steps.reduce((sum, x) => sum + x.cost, 0);
  const schema = inferSchema(steps);
  const label =
    rec.bot_conversationtranscriptidname ||
    agentLabel(schema, botMap);
  const id = rec.conversationtranscriptid || "(unknown)";
  const conversationId = (rec.name || "").split("_")[0] || id;

  return {
    id,
    conversationId,
    createdon: rec.createdon || "",
    agentSchema: schema,
    agentLabel: label,
    steps,
    engineCost,
    messages,
    events,
    latency: buildLatencyProfile(activities),
  };
}

export function isFailedStep(s: StepInfo): boolean {
  return String(s.state).toLowerCase() === "failed" || s.cost === 0;
}

/**
 * Disclaimer for the UI: premium/deep-reasoning token credits are billed on a
 * separate meter and are not captured in transcript-based figures.
 */
export const REASONING_COST_NOTE =
  "Deep-reasoning / premium-model token costs — \u201CText & generative AI tools (premium)\u201D, " +
  "10 Copilot Credits per 1,000 tokens — are billed on a separate meter and are not recorded in " +
  "transcripts. Agents that use a deep reasoning model incur additional credits beyond the figures shown here. " +
  "Reconcile actuals in PPAC \u2192 Licensing \u2192 Copilot Studio.";

/**
 * Roll transcripts up per agent. The deep-reasoning flag and model info come from
 * each agent's *configuration* (the modelNameHint on its Custom GPT component),
 * passed in via `modelBySchema` (schemaname → raw hint). This is authoritative —
 * unlike transcript heuristics, it reflects the model the agent is actually set to
 * use, so premium / reasoning-capable models are flagged even when the current
 * window has no reasoning activity.
 */
export function aggregateByAgent(
  runs: RunInfo[],
  modelBySchema?: Record<string, string>
): AgentRollup[] {
  const map = new Map<string, AgentRollup>();
  for (const r of runs) {
    const key = r.agentLabel || r.agentSchema;
    let a = map.get(key);
    if (!a) {
      const hint = modelBySchema?.[String(r.agentSchema).toLowerCase()] ?? "";
      const info = classifyModel(hint);
      a = {
        key,
        label: r.agentLabel,
        transcripts: 0,
        completed: 0,
        failed: 0,
        credits: 0,
        model: info.hint,
        modelLabel: info.label,
        modelTier: info.tier,
        deepReasoning: info.reasoning,
        estPremiumTokens: 0,
        estPremiumCredits: 0,
      };
      map.set(key, a);
    }
    a.transcripts++;
    for (const s of r.steps) {
      if (isFailedStep(s)) a.failed++;
      else a.completed++;
      a.credits += s.cost;
    }
    // Only reasoning-tier agents incur the premium token meter; estimate it.
    if (a.deepReasoning) a.estPremiumTokens += estimateRunTokens(r);
  }
  const list = [...map.values()];
  for (const a of list) {
    a.estPremiumCredits = a.deepReasoning
      ? Math.round(premiumCreditsForTokens(a.estPremiumTokens))
      : 0;
  }
  return list.sort((x, y) => y.credits - x.credits);
}

export interface Totals {
  transcripts: number;
  completed: number;
  failed: number;
  /** Actual Copilot Credits = sum of every step's displayedCost across the window. */
  credits: number;
}

export function totals(runs: RunInfo[]): Totals {
  let completed = 0,
    failed = 0,
    credits = 0;
  for (const r of runs) {
    for (const s of r.steps) {
      if (isFailedStep(s)) failed++;
      else completed++;
      credits += s.cost;
    }
  }
  return {
    transcripts: runs.length,
    completed,
    failed,
    credits,
  };
}

/** Actual Copilot Credits for a run = sum of the transcript's per-step displayedCost. */
export function runCredits(r: RunInfo): number {
  return r.steps.reduce((sum, s) => sum + s.cost, 0);
}

// ---------------------------------------------------------------------------
// Premium-token credit ESTIMATE (heuristic — for reasoning-tier agents only)
// ---------------------------------------------------------------------------
// The "Text & generative AI tools (premium)" meter (10 cr / 1,000 tokens) is
// billed by the model and is NOT written into conversation transcripts. When an
// agent runs a reasoning-tier model we can only APPROXIMATE that cost from the
// volume of text the model produced (its reasoning traces + answers), using the
// common ~4-characters-per-token rule of thumb. This is an order-of-magnitude
// estimate to make the otherwise-invisible premium meter tangible — reconcile
// real numbers in PPAC → Licensing → Copilot Studio.

/** Rough English-text token density (~4 chars per token). */
export const CHARS_PER_TOKEN = 4;
/** Premium-model token credit rate: 10 Copilot Credits per 1,000 tokens. */
export const PREMIUM_CREDITS_PER_1K_TOKENS = 10;

/**
 * Approximate the number of premium tokens a run generated, from the volume of
 * reasoning text (step thoughts) plus the agent's answer messages.
 */
export function estimateRunTokens(r: RunInfo): number {
  let chars = 0;
  for (const s of r.steps) chars += s.thought.length;
  for (const m of r.messages) if (m.role === "bot") chars += m.text.length;
  return Math.round(chars / CHARS_PER_TOKEN);
}

/** Convert an estimated token count into estimated premium credits. */
export function premiumCreditsForTokens(tokens: number): number {
  return (tokens / 1000) * PREMIUM_CREDITS_PER_1K_TOKENS;
}

// ---------------------------------------------------------------------------
// Extra rollups for the "full picture" (all derived from already-loaded runs)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string; // yyyy-mm-dd
  transcripts: number;
  credits: number;
}

/** Credits per day across the loaded window (sorted ascending). */
export function trendByDay(runs: RunInfo[]): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const r of runs) {
    const date = (r.createdon || "").slice(0, 10) || "(undated)";
    let p = map.get(date);
    if (!p) {
      p = { date, transcripts: 0, credits: 0 };
      map.set(date, p);
    }
    p.transcripts++;
    p.credits += runCredits(r);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface KindRollup {
  kind: string;
  completed: number;
  failed: number;
  credits: number;
}

/** Where the credits go: Knowledge / Action / Connected agent / Other. */
export function aggregateByKind(runs: RunInfo[]): KindRollup[] {
  const map = new Map<string, KindRollup>();
  for (const r of runs) {
    for (const s of r.steps) {
      let k = map.get(s.kind);
      if (!k) {
        k = { kind: s.kind, completed: 0, failed: 0, credits: 0 };
        map.set(s.kind, k);
      }
      if (isFailedStep(s)) k.failed++;
      else k.completed++;
      k.credits += s.cost;
    }
  }
  return [...map.values()].sort((a, b) => b.credits - a.credits);
}

export interface OwnerRollup {
  owner: string;
  transcripts: number;
  credits: number;
}

/**
 * Roll up cost by agent owner. `ownerBySchema` maps schemaname (lowercased) to
 * the owner display name, built from the bot inventory.
 */
export function aggregateByOwner(
  runs: RunInfo[],
  ownerBySchema: Record<string, string>
): OwnerRollup[] {
  const map = new Map<string, OwnerRollup>();
  for (const r of runs) {
    const owner = ownerBySchema[String(r.agentSchema).toLowerCase()] || "(unknown owner)";
    let o = map.get(owner);
    if (!o) {
      o = { owner, transcripts: 0, credits: 0 };
      map.set(owner, o);
    }
    o.transcripts++;
    o.credits += runCredits(r);
  }
  return [...map.values()].sort((a, b) => b.credits - a.credits);
}

export interface Distribution {
  count: number;
  min: number;
  p50: number;
  p90: number;
  max: number;
  mean: number;
}

/** Per-transcript credit distribution, to surface expensive outliers. */
export function creditDistribution(runs: RunInfo[]): Distribution {
  const vals = runs.map((r) => runCredits(r)).sort((a, b) => a - b);
  if (!vals.length) return { count: 0, min: 0, p50: 0, p90: 0, max: 0, mean: 0 };
  const pct = (p: number) => vals[Math.min(vals.length - 1, Math.floor((p / 100) * vals.length))];
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    count: vals.length,
    min: vals[0],
    p50: pct(50),
    p90: pct(90),
    max: vals[vals.length - 1],
    mean: Math.round((sum / vals.length) * 10) / 10,
  };
}
