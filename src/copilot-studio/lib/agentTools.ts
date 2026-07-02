/**
 * Agent tool references — the cross-reference layer.
 *
 * Every tool an agent can call is a `botcomponent` (a V2 action, or an external
 * trigger). Its `data` blob (Copilot Studio component YAML) names exactly what it
 * invokes: a Power Automate / agent flow, a connector, an MCP / external agent, a
 * Computer Use session, or an AI Builder prompt. Parsing that blob gives an
 * authoritative "which tool of which agent uses which flow / prompt / connector"
 * map — no guessing from names.
 *
 * The same tool schema name appears as the `taskDialogId` on transcript steps, so
 * these refs also correlate runtime usage (see agentFlows.rollupFlows).
 */

/** What a tool invokes. */
export type ToolKind =
  | "flow"
  | "trigger"
  | "connector"
  | "mcp"
  | "externalAgent"
  | "computerUse"
  | "prompt"
  | "other";

export const TOOL_KIND_LABELS: Record<ToolKind, string> = {
  flow: "Agent flow",
  trigger: "Flow trigger",
  connector: "Connector",
  mcp: "MCP server",
  externalAgent: "External agent",
  computerUse: "Computer use",
  prompt: "Prompt",
  other: "Other",
};

/** Raw tool-bearing botcomponent row (subset of columns we read, incl. `data`). */
export interface RawToolComponent {
  botId: string; // _parentbotid_value
  name: string;
  schemaname: string;
  componenttype: number;
  data: string;
}

/** A parsed reference from one agent tool to the resource it invokes. */
export interface ToolRef {
  botId: string;
  /** Display name of the tool (the botcomponent name). */
  toolName: string;
  /** Schema name of the tool — matches a transcript step's taskDialogId. */
  toolSchema: string;
  kind: ToolKind;
  /** Raw `action.kind` from the component YAML. */
  actionKind: string;
  /** Target agent flow / Power Automate workflow id (kind flow | trigger). */
  flowId?: string;
  /** Target connection reference logical path (kind connector | mcp | externalAgent | computerUse). */
  connectionReference?: string;
  /** Connector API segment of the connection reference (e.g. shared_commondataserviceforapps). */
  connectorApi?: string;
  /** Target AI Builder model / prompt id (kind prompt). */
  promptId?: string;
}

const GUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

function firstMatch(data: string, re: RegExp): string | undefined {
  const m = data.match(re);
  return m ? m[1] : undefined;
}

/** The connector API is the middle segment of `<botschema>.<connectorApi>.<connName>`. */
export function connectorApiFromRef(ref: string): string {
  const parts = ref.split(".");
  return parts.length >= 2 ? parts[1] : ref;
}

/**
 * Parse a single tool-bearing botcomponent into a ToolRef. Returns null when the
 * component does not invoke an external resource (plain topics, message-only
 * dialogs, etc.).
 */
export function parseToolComponent(raw: RawToolComponent): ToolRef | null {
  const data = raw.data || "";
  if (!data) return null;

  const base = {
    botId: raw.botId,
    toolName: raw.name || raw.schemaname,
    toolSchema: raw.schemaname,
  };

  // External trigger (an agent flow that starts the agent).
  if (/kind:\s*WorkflowExternalTrigger/.test(data)) {
    const flowId = firstMatch(data, new RegExp(`flowId:\\s*(${GUID})`));
    return { ...base, kind: "trigger", actionKind: "WorkflowExternalTrigger", flowId };
  }

  // Recognised action kinds.
  const actionKind = firstMatch(data, /kind:\s*(Invoke\w*(?:Task)?Action)/);
  if (!actionKind) return null;

  if (/InvokeFlowTaskAction/.test(actionKind)) {
    const flowId = firstMatch(data, new RegExp(`flowId:\\s*(${GUID})`));
    return { ...base, kind: "flow", actionKind, flowId };
  }

  if (/InvokeComputerUsingAgentTaskAction/.test(actionKind)) {
    const connectionReference = firstMatch(data, /connectionReference:\s*(\S+)/);
    return {
      ...base,
      kind: "computerUse",
      actionKind,
      connectionReference,
      connectorApi: connectionReference ? connectorApiFromRef(connectionReference) : undefined,
    };
  }

  if (/InvokeExternalAgentTaskAction/.test(actionKind)) {
    const connectionReference = firstMatch(data, /connectionReference:\s*(\S+)/);
    const api = connectionReference ? connectorApiFromRef(connectionReference) : "";
    const kind: ToolKind = /mcp/i.test(api) ? "mcp" : "externalAgent";
    return { ...base, kind, actionKind, connectionReference, connectorApi: api || undefined };
  }

  if (/InvokeConnectorTaskAction/.test(actionKind)) {
    const connectionReference = firstMatch(data, /connectionReference:\s*(\S+)/);
    return {
      ...base,
      kind: "connector",
      actionKind,
      connectionReference,
      connectorApi: connectionReference ? connectorApiFromRef(connectionReference) : undefined,
    };
  }

  // AI Builder / prompt actions embed the model id.
  if (/AIBuilder|Prediction|Prompt/i.test(actionKind)) {
    const promptId = firstMatch(
      data,
      new RegExp(`(?:aiModelId|modelId|predictionId|promptId|msdyn_aimodel[a-z]*id?):?\\s*["']?(${GUID})`, "i")
    );
    return { ...base, kind: "prompt", actionKind, promptId };
  }

  // A recognised action kind we don't classify further — still a tool, but with
  // no external target we can map. Skip it from the cross-reference.
  return null;
}

/** Parse many tool components, dropping non-tool rows. */
export function parseTools(rows: RawToolComponent[]): ToolRef[] {
  const out: ToolRef[] = [];
  for (const r of rows) {
    const ref = parseToolComponent(r);
    if (ref) out.push(ref);
  }
  return out;
}

/** flowId (lowercased) → tools that invoke it. */
export function indexToolsByFlow(tools: ToolRef[]): Record<string, ToolRef[]> {
  const out: Record<string, ToolRef[]> = {};
  for (const t of tools) {
    if ((t.kind === "flow" || t.kind === "trigger") && t.flowId) {
      const k = t.flowId.toLowerCase();
      (out[k] ??= []).push(t);
    }
  }
  return out;
}

/** promptId (lowercased) → tools that invoke it. */
export function indexToolsByPrompt(tools: ToolRef[]): Record<string, ToolRef[]> {
  const out: Record<string, ToolRef[]> = {};
  for (const t of tools) {
    if (t.kind === "prompt" && t.promptId) {
      const k = t.promptId.toLowerCase();
      (out[k] ??= []).push(t);
    }
  }
  return out;
}

/** botId → its parsed tools. */
export function toolsByAgent(tools: ToolRef[]): Record<string, ToolRef[]> {
  const out: Record<string, ToolRef[]> = {};
  for (const t of tools) {
    if (!t.botId) continue;
    (out[t.botId] ??= []).push(t);
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.toolName.localeCompare(b.toolName));
  }
  return out;
}
