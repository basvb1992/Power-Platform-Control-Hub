/**
 * Prompt inventory + cross-reference rollup.
 *
 * "Prompts" are AI Builder / Copilot Studio custom prompts (msdyn_aimodel). A
 * prompt is referenced by an agent tool (an AI Builder action) or, more often,
 * from inside an agent flow. This module lists each prompt and the agents/tools
 * that reference it directly.
 *
 * Note: prompt usage that lives inside a flow definition (workflow.clientdata) is
 * not scanned in bulk here — those prompts surface with no direct agent reference
 * and are flagged accordingly (they are not necessarily unused).
 */
import type { ToolRef } from "./agentTools.ts";
import { indexToolsByPrompt } from "./agentTools.ts";

/** One prompt (msdyn_aimodel). */
export interface PromptModel {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  createdon: string;
  modifiedon: string;
  owner: string;
}

/** An agent/tool that references a prompt. */
export interface PromptUsage {
  botId: string;
  agentName: string;
  toolName: string;
}

export interface PromptRollup {
  prompt: PromptModel;
  usedByAgents: PromptUsage[];
  /** True when no agent tool references the prompt directly (may be used inside a flow). */
  noDirectAgentUse: boolean;
}

export function rollupPrompts(
  prompts: PromptModel[],
  tools: ToolRef[],
  botNameById: Record<string, string>
): PromptRollup[] {
  const byPrompt = indexToolsByPrompt(tools);

  return prompts
    .map((prompt) => {
      const refs = byPrompt[prompt.id.toLowerCase()] ?? [];
      const usedByAgents: PromptUsage[] = refs.map((t) => ({
        botId: t.botId,
        agentName: botNameById[t.botId] || "(unknown agent)",
        toolName: t.toolName,
      }));
      return {
        prompt,
        usedByAgents,
        noDirectAgentUse: usedByAgents.length === 0,
      };
    })
    .sort((a, b) => {
      if (b.usedByAgents.length !== a.usedByAgents.length)
        return b.usedByAgents.length - a.usedByAgents.length;
      return a.prompt.name.localeCompare(b.prompt.name);
    });
}
