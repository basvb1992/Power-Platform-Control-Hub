/**
 * Agent flow inventory + cross-reference rollup.
 *
 * "Agent flows" are Power Automate cloud flows (workflow, category 5) authored in
 * or called by Copilot Studio agents. This module joins three views:
 *   • definition  — name, description, state, owner (from the workflows table)
 *   • static use  — which agents/tools reference the flow (from parsed ToolRefs)
 *   • runtime     — how often it ran, success/failure, credits (from transcripts)
 * so each flow shows where it is used, what it does and its outcome.
 */
import type { ToolRef } from "./agentTools.ts";
import { indexToolsByFlow } from "./agentTools.ts";
import type { RunInfo } from "./costEngine.ts";
import { isFailedStep } from "./costEngine.ts";

/** One agent flow (workflow, category 5). */
export interface AgentFlow {
  id: string;
  name: string;
  description: string;
  state: string;
  isActive: boolean;
  createdon: string;
  modifiedon: string;
  owner: string;
}

/** An agent/tool that references a flow. */
export interface FlowUsage {
  botId: string;
  agentName: string;
  toolName: string;
  isTrigger: boolean;
}

/** Transcript-derived runtime signal for a flow. */
export interface FlowRuntime {
  invocations: number;
  successes: number;
  failures: number;
  credits: number;
  lastUsed: string;
}

export interface FlowRollup {
  flow: AgentFlow;
  usedBy: FlowUsage[];
  runtime: FlowRuntime;
  /** True when no agent tool references the flow (may still run standalone). */
  orphan: boolean;
}

function emptyRuntime(): FlowRuntime {
  return { invocations: 0, successes: 0, failures: 0, credits: 0, lastUsed: "" };
}

/** schema (lowercased) → flowId, for correlating transcript steps to a flow. */
function toolSchemaToFlowId(tools: ToolRef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tools) {
    if ((t.kind === "flow" || t.kind === "trigger") && t.flowId && t.toolSchema) {
      out[t.toolSchema.toLowerCase()] = t.flowId.toLowerCase();
    }
  }
  return out;
}

/** Match a transcript step's taskDialogId to a known tool schema. */
function flowIdForStepTool(tool: string, map: Record<string, string>): string | undefined {
  const key = tool.toLowerCase();
  if (map[key]) return map[key];
  for (const [schema, flowId] of Object.entries(map)) {
    if (key.startsWith(schema) || key.endsWith(schema)) return flowId;
  }
  return undefined;
}

/**
 * Build the flow rollup. `botNameById` resolves a referencing tool's parent bot to
 * a friendly agent name.
 */
export function rollupFlows(
  flows: AgentFlow[],
  tools: ToolRef[],
  runs: RunInfo[],
  botNameById: Record<string, string>
): FlowRollup[] {
  const byFlow = indexToolsByFlow(tools);
  const schemaToFlow = toolSchemaToFlowId(tools);

  // Runtime: attribute each flow-priced step to its flow via the tool schema.
  const runtime: Record<string, FlowRuntime> = {};
  for (const r of runs) {
    for (const s of r.steps) {
      if (s.cost !== 13 && !/InvokeFlow|WorkflowExternalTrigger/i.test(s.tool)) continue;
      const flowId = flowIdForStepTool(s.tool, schemaToFlow);
      if (!flowId) continue;
      const rt = (runtime[flowId] ??= emptyRuntime());
      rt.invocations++;
      if (isFailedStep(s)) rt.failures++;
      else rt.successes++;
      rt.credits += s.cost;
      if (!rt.lastUsed || r.createdon > rt.lastUsed) rt.lastUsed = r.createdon;
    }
  }

  return flows
    .map((flow) => {
      const refs = byFlow[flow.id.toLowerCase()] ?? [];
      const usedBy: FlowUsage[] = refs.map((t) => ({
        botId: t.botId,
        agentName: botNameById[t.botId] || "(unknown agent)",
        toolName: t.toolName,
        isTrigger: t.kind === "trigger",
      }));
      return {
        flow,
        usedBy,
        runtime: runtime[flow.id.toLowerCase()] ?? emptyRuntime(),
        orphan: usedBy.length === 0,
      };
    })
    .sort((a, b) => {
      // Most-referenced, then most-run, then name.
      if (b.usedBy.length !== a.usedBy.length) return b.usedBy.length - a.usedBy.length;
      if (b.runtime.invocations !== a.runtime.invocations)
        return b.runtime.invocations - a.runtime.invocations;
      return a.flow.name.localeCompare(b.flow.name);
    });
}
