/**
 * Tenant-wide data access for the Copilot Studio deep analytics.
 *
 * Unlike the original single-environment dashboard, this adapter reads from ANY
 * environment the signed-in admin can reach, by routing Dataverse queries through
 * the connector's `ListRecordsWithOrganization` operation (see
 * services/dataverseConnectorService). The caller passes the target environment's
 * Dataverse org URL (instanceUrl), so the same deep views (cost, conversations,
 * governance, control tower) work across the whole tenant.
 */
import { listRecordsWithOrg } from "../../services/dataverseConnectorService.ts";
import { parseTranscript, type BotMap, type RunInfo } from "./costEngine.ts";
import type { BotComponent } from "./botComponents.ts";
import type { ConnectionRef } from "./connections.ts";
import { extractModelHint } from "./models.ts";
import { parseTools, type ToolRef } from "./agentTools.ts";
import type { AgentFlow } from "./agentFlows.ts";
import type { PromptModel } from "./prompts.ts";

const FMT = "@OData.Community.Display.V1.FormattedValue";
const ANNOTATIONS = 'odata.include-annotations="*"';

/**
 * Authoring type of a Copilot Studio agent:
 * - `Modern`     — the newest `cliagent` template (single instruction-driven LLM,
 *                  knowledge + tools, no topics; `CLICopilotRecognizer`).
 * - `Generative` — autonomous / orchestrated agent (`GenerativeAIRecognizer`,
 *                  generative actions on).
 * - `Classic`    — topic-based / manually orchestrated agent.
 */
export type AgentKind = "Modern" | "Generative" | "Classic";

export interface AgentInventoryItem {
  botid: string;
  name: string;
  schemaname: string;
  state: string;
  owner: string;
  createdon: string;
  publishedon: string;
  authMode: string;
  languages: string;
  /** Raw modelNameHint from the agent's Custom GPT component (empty when unknown). */
  model: string;
  /** Authoring type (Classic / Generative / Modern), from template + configuration. */
  kind: AgentKind;
  /** Raw template string, e.g. "default-2.1.0" or "cliagent-1.0.0" (empty when unknown). */
  template: string;
}

/**
 * Classify an agent's authoring type from its `template` and `configuration`
 * (the BotConfiguration JSON on the bot row). Mirrors the modern-vs-classic
 * split from Roel's mcs-modern-agent-analyser (`cliagent` template /
 * `CLICopilotRecognizer`), but reads the same signal live from Dataverse
 * instead of an exported BotDefinition YAML.
 */
export function classifyAgentKind(template: string, configuration: string): AgentKind {
  const t = (template || "").toLowerCase();
  let recognizer = "";
  let generativeActions = false;
  try {
    const cfg = configuration ? JSON.parse(configuration) : null;
    recognizer = String(cfg?.recognizer?.["$kind"] ?? "").toLowerCase();
    generativeActions = Boolean(cfg?.settings?.GenerativeActionsEnabled);
  } catch {
    // configuration is best-effort; fall back to template-only classification.
  }
  if (t.startsWith("cliagent") || recognizer.includes("clicopilot")) return "Modern";
  if (generativeActions || recognizer.includes("generativeai")) return "Generative";
  return "Classic";
}

export interface BotData {
  inventory: AgentInventoryItem[];
  botMap: BotMap;
  /** schemaname (lowercased) → raw modelNameHint, for cost rollups. */
  modelBySchema: Record<string, string>;
}

export interface TranscriptQuery {
  fromIso?: string; // yyyy-mm-dd
  toIso?: string; // yyyy-mm-dd
  schemaFilter?: string;
  max?: number;
}

const s = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

/** Fetch the agent (bot) inventory for one environment and build schema→name map. */
export async function fetchBots(instanceUrl: string): Promise<BotData> {
  const rows = await listRecordsWithOrg(instanceUrl, "bots", {
    select:
      "botid,name,schemaname,statecode,_ownerid_value,createdon,publishedon,authenticationmode,supportedlanguages,template,configuration",
    orderby: "name asc",
    top: 500,
    prefer: ANNOTATIONS,
  });

  // Each agent's answer model lives in its Custom GPT component (componenttype 15),
  // inside the `data` blob as `modelNameHint`. One query builds botid → model.
  const modelByBotId: Record<string, string> = {};
  try {
    const gpt = await listRecordsWithOrg(instanceUrl, "botcomponents", {
      select: "_parentbotid_value,data",
      filter: "componenttype eq 15",
      top: 2000,
    });
    for (const g of gpt) {
      const parent = s(g["_parentbotid_value"]).toLowerCase();
      const hint = extractModelHint(s(g["data"]));
      if (parent && hint && !modelByBotId[parent]) modelByBotId[parent] = hint;
    }
  } catch {
    // Model detection is best-effort; inventory still loads without it.
  }

  const inventory: AgentInventoryItem[] = [];
  const botMap: BotMap = {};
  const modelBySchema: Record<string, string> = {};
  for (const r of rows) {
    const name = s(r["name"]) || s(r["schemaname"]);
    const schemaname = s(r["schemaname"]);
    if (schemaname && name) botMap[schemaname.toLowerCase()] = name;
    const botid = s(r["botid"]);
    const model = modelByBotId[botid.toLowerCase()] ?? "";
    if (schemaname && model) modelBySchema[schemaname.toLowerCase()] = model;
    inventory.push({
      botid,
      name,
      schemaname,
      state: s(r[`statecode${FMT}`] ?? r["statecode"]),
      owner: s(r[`_ownerid_value${FMT}`]),
      createdon: s(r["createdon"]),
      publishedon: s(r["publishedon"]),
      authMode: s(r[`authenticationmode${FMT}`] ?? r["authenticationmode"]),
      languages: s(r["supportedlanguages"]),
      model,
      template: s(r["template"]),
      kind: classifyAgentKind(s(r["template"]), s(r["configuration"])),
    });
  }
  inventory.sort((a, z) => a.name.localeCompare(z.name));
  return { inventory, botMap, modelBySchema };
}

/** Fetch all top-level botcomponent rows (topics, knowledge, actions, …) for an env. */
export async function fetchBotComponents(instanceUrl: string): Promise<BotComponent[]> {
  const rows = await listRecordsWithOrg(instanceUrl, "botcomponents", {
    select: "name,schemaname,componenttype,statecode,_parentbotid_value,modifiedon",
    filter: "_parentbotcomponentid_value eq null",
    orderby: "componenttype asc,name asc",
    top: 2000,
  });
  return rows.map((r) => ({
    name: s(r["name"]),
    schemaname: s(r["schemaname"]),
    componenttype: Number(r["componenttype"] ?? -1),
    statecode: Number(r["statecode"] ?? 0),
    parentbotid: s(r["_parentbotid_value"]),
    modifiedon: s(r["modifiedon"]),
  }));
}

/** Fetch connection references (agent ↔ connector links) for an env. */
export async function fetchConnectionReferences(instanceUrl: string): Promise<ConnectionRef[]> {
  const rows = await listRecordsWithOrg(instanceUrl, "connectionreferences", {
    select: "connectionreferencedisplayname,connectionreferencelogicalname,connectorid",
    top: 2000,
  });
  return rows.map((r) => ({
    displayName: s(r["connectionreferencedisplayname"]),
    logicalName: s(r["connectionreferencelogicalname"]),
    connectorId: s(r["connectorid"]),
  }));
}

/**
 * Fetch agent flows (Power Automate cloud flows, workflow category 5 / type 1)
 * for an env. Their AI-authored description doubles as a "what it does" summary.
 */
export async function fetchAgentFlows(instanceUrl: string): Promise<AgentFlow[]> {
  const rows = await listRecordsWithOrg(instanceUrl, "workflows", {
    select:
      "workflowid,name,description,statecode,createdon,modifiedon,_ownerid_value",
    filter: "category eq 5 and type eq 1",
    orderby: "name asc",
    top: 2000,
    prefer: ANNOTATIONS,
  });
  return rows.map((r) => {
    const isActive = Number(r["statecode"] ?? 0) === 1;
    return {
      id: s(r["workflowid"]),
      name: s(r["name"]),
      description: s(r["description"]),
      state: s(r[`statecode${FMT}`] ?? (isActive ? "Activated" : "Draft")),
      isActive,
      createdon: s(r["createdon"]),
      modifiedon: s(r["modifiedon"]),
      owner: s(r[`_ownerid_value${FMT}`]),
    };
  });
}

/** Fetch AI Builder / Copilot Studio prompts (msdyn_aimodel) for an env. */
export async function fetchPrompts(instanceUrl: string): Promise<PromptModel[]> {
  const rows = await listRecordsWithOrg(instanceUrl, "msdyn_aimodels", {
    select:
      "msdyn_aimodelid,msdyn_name,statecode,statuscode,createdon,modifiedon,_ownerid_value",
    orderby: "msdyn_name asc",
    top: 2000,
    prefer: ANNOTATIONS,
  });
  return rows.map((r) => ({
    id: s(r["msdyn_aimodelid"]),
    name: s(r["msdyn_name"]),
    status: s(r[`statuscode${FMT}`] ?? r[`statecode${FMT}`]),
    isActive: Number(r["statecode"] ?? 0) === 0,
    createdon: s(r["createdon"]),
    modifiedon: s(r["modifiedon"]),
    owner: s(r[`_ownerid_value${FMT}`]),
  }));
}

/**
 * Fetch the tool-bearing botcomponents (V2 actions and external triggers) with
 * their `data` blob, and parse them into cross-reference ToolRefs. This is the
 * authoritative map of which agent tool invokes which flow / prompt / connector.
 */
export async function fetchAgentTools(instanceUrl: string): Promise<ToolRef[]> {
  const rows = await listRecordsWithOrg(instanceUrl, "botcomponents", {
    select: "name,schemaname,componenttype,_parentbotid_value,data",
    filter:
      "_parentbotcomponentid_value eq null and (contains(schemaname,'.action.') or componenttype eq 17)",
    top: 2000,
  });
  return parseTools(
    rows.map((r) => ({
      botId: s(r["_parentbotid_value"]),
      name: s(r["name"]),
      schemaname: s(r["schemaname"]),
      componenttype: Number(r["componenttype"] ?? -1),
      data: s(r["data"]),
    }))
  );
}

/**
 * Fetch conversation transcripts within a date window and parse them into runs.
 * Date filtering runs server-side; the optional agent filter is applied client
 * side after parsing (the schema name lives inside the JSON content).
 */
export async function fetchRuns(
  instanceUrl: string,
  q: TranscriptQuery,
  botMap: BotMap
): Promise<RunInfo[]> {
  const max = Math.max(1, q.max ?? 500);
  const filters: string[] = [];
  if (q.fromIso) filters.push(`createdon ge ${q.fromIso}T00:00:00Z`);
  if (q.toIso) filters.push(`createdon le ${q.toIso}T23:59:59Z`);

  const rows = await listRecordsWithOrg(instanceUrl, "conversationtranscripts", {
    select: "conversationtranscriptid,createdon,content,name,_bot_conversationtranscriptid_value",
    filter: filters.length ? filters.join(" and ") : undefined,
    orderby: "createdon desc",
    top: Math.min(max, 1000),
    prefer: ANNOTATIONS,
  });

  const runs: RunInfo[] = [];
  for (const r of rows) {
    const run = parseTranscript(
      {
        conversationtranscriptid: s(r["conversationtranscriptid"]),
        createdon: s(r["createdon"]),
        content: s(r["content"]),
        name: s(r["name"]),
        bot_conversationtranscriptidname: s(r[`_bot_conversationtranscriptid_value${FMT}`]),
      },
      botMap
    );
    if (run) runs.push(run);
  }

  const filtered = q.schemaFilter
    ? runs.filter(
        (r) =>
          r.agentSchema.toLowerCase().includes(q.schemaFilter!.toLowerCase()) ||
          r.agentLabel.toLowerCase().includes(q.schemaFilter!.toLowerCase())
      )
    : runs;

  return filtered.slice(0, max);
}
