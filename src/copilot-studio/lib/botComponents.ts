/**
 * Copilot Studio agent-context model.
 *
 * Every agent (bot) is made of `botcomponent` rows — topics, triggers, knowledge
 * sources, actions, entities, variables, etc. This module turns the raw rows into
 * a per-agent capability rollup so the dashboard can show "what is inside each
 * agent", not just what it costs.
 */

/** Raw botcomponent record (subset of columns we read). */
export interface BotComponent {
  name: string;
  schemaname: string;
  componenttype: number;
  statecode: number;
  parentbotid: string; // _parentbotid_value
  modifiedon: string;
}

/** Friendly label for the Dataverse `componenttype` option set. */
export const COMPONENT_TYPE_LABELS: Record<number, string> = {
  0: "Topic",
  1: "Skill",
  2: "Variable",
  3: "Entity",
  4: "Dialog",
  5: "Trigger",
  6: "Language understanding",
  7: "Language generation",
  8: "Dialog schema",
  9: "Topic (V2)",
  10: "Translations",
  11: "Entity (V2)",
  12: "Variable (V2)",
  13: "Skill (V2)",
  14: "File attachment",
  15: "Custom GPT",
  16: "Knowledge source",
  17: "External trigger",
  18: "Copilot settings",
  19: "Test case",
  20: "Custom metric",
};

export function componentTypeLabel(t: number): string {
  return COMPONENT_TYPE_LABELS[t] ?? `Type ${t}`;
}

/** High-level capability buckets surfaced in the monitoring UI. */
export type CapabilityKey =
  | "topics"
  | "actions"
  | "knowledge"
  | "triggers"
  | "entities"
  | "variables"
  | "skills"
  | "gpt"
  | "tests"
  | "other";

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  topics: "Topics",
  actions: "Actions",
  knowledge: "Knowledge",
  triggers: "Triggers",
  entities: "Entities",
  variables: "Variables",
  skills: "Skills",
  gpt: "Custom GPT",
  tests: "Test cases",
  other: "Other",
};

export const CAPABILITY_ORDER: CapabilityKey[] = [
  "topics",
  "actions",
  "knowledge",
  "triggers",
  "entities",
  "variables",
  "skills",
  "gpt",
  "tests",
  "other",
];

/** Map a component to its capability bucket. Actions are V2 topics whose schema carries `.action.`. */
export function capabilityOf(c: BotComponent): CapabilityKey {
  if (c.schemaname && c.schemaname.toLowerCase().includes(".action.")) return "actions";
  switch (c.componenttype) {
    case 0:
    case 9:
      return "topics";
    case 16:
      return "knowledge";
    case 5:
    case 17:
      return "triggers";
    case 3:
    case 11:
      return "entities";
    case 2:
    case 12:
      return "variables";
    case 1:
    case 13:
      return "skills";
    case 15:
      return "gpt";
    case 19:
      return "tests";
    default:
      return "other";
  }
}

export type CapabilityCounts = Record<CapabilityKey, number>;

function emptyCounts(): CapabilityCounts {
  return {
    topics: 0,
    actions: 0,
    knowledge: 0,
    triggers: 0,
    entities: 0,
    variables: 0,
    skills: 0,
    gpt: 0,
    tests: 0,
    other: 0,
  };
}

/** Per-agent rollup of components. */
export interface AgentComponentRollup {
  total: number;
  active: number;
  byCapability: CapabilityCounts;
  components: BotComponent[];
}

/**
 * Group components by their parent bot id. Only active components (statecode 0)
 * are counted toward the capability totals; inactive ones are still kept in the
 * detail list.
 */
export function rollupComponents(
  components: BotComponent[]
): Record<string, AgentComponentRollup> {
  const out: Record<string, AgentComponentRollup> = {};
  for (const c of components) {
    if (!c.parentbotid) continue;
    let r = out[c.parentbotid];
    if (!r) {
      r = { total: 0, active: 0, byCapability: emptyCounts(), components: [] };
      out[c.parentbotid] = r;
    }
    r.total++;
    r.components.push(c);
    if (c.statecode === 0) {
      r.active++;
      r.byCapability[capabilityOf(c)]++;
    }
  }
  for (const r of Object.values(out)) {
    r.components.sort((a, z) => a.name.localeCompare(z.name));
  }
  return out;
}

/** Tenant-wide capability totals across all agents (active components only). */
export function totalCapabilities(components: BotComponent[]): CapabilityCounts {
  const counts = emptyCounts();
  for (const c of components) {
    if (c.statecode === 0) counts[capabilityOf(c)]++;
  }
  return counts;
}
