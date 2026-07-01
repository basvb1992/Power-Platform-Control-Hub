/**
 * Cost engine — reconstructs Copilot Credit consumption from Copilot Studio
 * conversation transcripts. Verified model: each completed plan step carries a
 * `displayedCost` (flat 7 = 5 agent action + 2 generative reasoning); a failed
 * step costs 0. Run cost = sum of displayedCost across the transcript.
 */

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
}

export interface CostModel {
  creditPerStep: number;
  pricePerCredit: number;
  currency: string;
}

export const DEFAULT_COST_MODEL: CostModel = {
  creditPerStep: 7,
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
  };
}

export function isFailedStep(s: StepInfo): boolean {
  return String(s.state).toLowerCase() === "failed" || s.cost === 0;
}

export function aggregateByAgent(runs: RunInfo[], creditPerStep: number): AgentRollup[] {
  const map = new Map<string, AgentRollup>();
  for (const r of runs) {
    const key = r.agentLabel || r.agentSchema;
    let a = map.get(key);
    if (!a) {
      a = { key, label: r.agentLabel, transcripts: 0, completed: 0, failed: 0, credits: 0 };
      map.set(key, a);
    }
    a.transcripts++;
    for (const s of r.steps) {
      if (isFailedStep(s)) a.failed++;
      else {
        a.completed++;
        a.credits += creditPerStep;
      }
    }
  }
  return [...map.values()].sort((x, y) => y.credits - x.credits);
}

export interface Totals {
  transcripts: number;
  completed: number;
  failed: number;
  modeledCredits: number;
  engineCredits: number;
}

export function totals(runs: RunInfo[], creditPerStep: number): Totals {
  let completed = 0,
    failed = 0,
    engineCredits = 0;
  for (const r of runs) {
    for (const s of r.steps) {
      if (isFailedStep(s)) failed++;
      else completed++;
    }
    engineCredits += r.engineCost;
  }
  return {
    transcripts: runs.length,
    completed,
    failed,
    modeledCredits: completed * creditPerStep,
    engineCredits,
  };
}

export function runCredits(r: RunInfo, creditPerStep: number): number {
  return r.steps.filter((s) => !isFailedStep(s)).length * creditPerStep;
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
export function trendByDay(runs: RunInfo[], creditPerStep: number): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const r of runs) {
    const date = (r.createdon || "").slice(0, 10) || "(undated)";
    let p = map.get(date);
    if (!p) {
      p = { date, transcripts: 0, credits: 0 };
      map.set(date, p);
    }
    p.transcripts++;
    p.credits += runCredits(r, creditPerStep);
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
export function aggregateByKind(runs: RunInfo[], creditPerStep: number): KindRollup[] {
  const map = new Map<string, KindRollup>();
  for (const r of runs) {
    for (const s of r.steps) {
      let k = map.get(s.kind);
      if (!k) {
        k = { kind: s.kind, completed: 0, failed: 0, credits: 0 };
        map.set(s.kind, k);
      }
      if (isFailedStep(s)) k.failed++;
      else {
        k.completed++;
        k.credits += creditPerStep;
      }
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
  ownerBySchema: Record<string, string>,
  creditPerStep: number
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
    o.credits += runCredits(r, creditPerStep);
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
export function creditDistribution(runs: RunInfo[], creditPerStep: number): Distribution {
  const vals = runs.map((r) => runCredits(r, creditPerStep)).sort((a, b) => a - b);
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
