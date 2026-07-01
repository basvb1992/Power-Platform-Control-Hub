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

const FMT = "@OData.Community.Display.V1.FormattedValue";
const ANNOTATIONS = 'odata.include-annotations="*"';

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
}

export interface BotData {
  inventory: AgentInventoryItem[];
  botMap: BotMap;
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
      "botid,name,schemaname,statecode,_ownerid_value,createdon,publishedon,authenticationmode,supportedlanguages",
    orderby: "name asc",
    top: 500,
    prefer: ANNOTATIONS,
  });

  const inventory: AgentInventoryItem[] = [];
  const botMap: BotMap = {};
  for (const r of rows) {
    const name = s(r["name"]) || s(r["schemaname"]);
    const schemaname = s(r["schemaname"]);
    if (schemaname && name) botMap[schemaname.toLowerCase()] = name;
    inventory.push({
      botid: s(r["botid"]),
      name,
      schemaname,
      state: s(r[`statecode${FMT}`] ?? r["statecode"]),
      owner: s(r[`_ownerid_value${FMT}`]),
      createdon: s(r["createdon"]),
      publishedon: s(r["publishedon"]),
      authMode: s(r[`authenticationmode${FMT}`] ?? r["authenticationmode"]),
      languages: s(r["supportedlanguages"]),
    });
  }
  inventory.sort((a, z) => a.name.localeCompare(z.name));
  return { inventory, botMap };
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
