/**
 * Microsoft 365 Copilot agent setup data — read from Microsoft 365 (not Dataverse)
 * via the Graph Copilot Package Management API (beta), wrapped by the
 * `m365copilotpackages` custom connector (see connectors/m365-copilot-packages/).
 *
 * Agents built in the Microsoft 365 Copilot Agent Builder store their config
 * (instructions, capabilities, knowledge, actions) inside the package
 * `elementDetails` rather than the Dataverse bot tables, so the Copilot Studio
 * deep analytics reaches them through this connector instead.
 *
 * Requires a Microsoft Agent 365 license and CopilotPackages.Read.All (AI/Global
 * admin). The API is preview; until the connector + connection are provisioned the
 * calls fail gracefully and the UI shows a setup hint.
 */
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo.ts";

const client = getClient(dataSourcesInfo);

/** Data-source name the custom connector is registered under (pac code add-data-source). */
const DATA_SOURCE = "m365copilotpackages";

/** A package (agent/app) row from the Graph catalog. */
export interface CopilotPackage {
  id: string;
  displayName: string;
  type?: string;
  shortDescription?: string;
  isBlocked?: boolean;
  supportedHosts?: string[];
  elementTypes?: string[];
  lastModifiedDateTime?: string;
  publisher?: string;
  availableTo?: string;
  deployedTo?: string;
  platform?: string;
  version?: string;
  manifestId?: string;
  appId?: string;
}

interface CopilotElementDetail {
  elementType?: string;
  elements?: { id?: string; definition?: string }[];
}

/** Full package detail — `elementDetails` carries the setup data. */
export interface CopilotPackageDetail extends CopilotPackage {
  longDescription?: string;
  categories?: string[];
  sensitivity?: string;
  elementDetails?: CopilotElementDetail[];
}

/** Setup data extracted from a declarative-agent definition. */
export interface AgentSetup {
  name?: string;
  version?: string;
  instructions?: string;
  description?: string;
  conversationStarters: string[];
  capabilities: string[];
  knowledge: string[];
  actions: string[];
  /** Raw element definitions (one per element), for inspection/fallback. */
  raw: { elementType: string; json: string }[];
}

/** Is this package a Copilot agent (vs. an Office add-in, message extension, etc.)? */
export function isCopilotAgent(p: CopilotPackage): boolean {
  const hosts = (p.supportedHosts ?? []).map((h) => h.toLowerCase());
  const els = (p.elementTypes ?? []).map((e) => e.toLowerCase());
  return hosts.includes("copilot") || els.includes("declarativeagent") || els.includes("customengineagent");
}

/**
 * List Copilot packages in the tenant. By default narrows to agents
 * (`supportedHosts` contains `Copilot`).
 */
export async function listCopilotPackages(opts: { agentsOnly?: boolean; filter?: string } = {}): Promise<CopilotPackage[]> {
  const parameters: Record<string, unknown> = {};
  const filter = opts.filter ?? (opts.agentsOnly === false ? undefined : "supportedHosts/any(h:h eq 'Copilot')");
  if (filter) parameters["$filter"] = filter;

  const res = await client.executeAsync<Record<string, unknown>, { value?: CopilotPackage[] }>({
    connectorOperation: {
      tableName: DATA_SOURCE,
      operationName: "ListCopilotPackages",
      parameters,
    },
  });
  if (!res.success) throw res.error ?? new Error("Failed to list Copilot packages");
  return res.data?.value ?? [];
}

/** Get the full detail (including setup data) for one package. */
export async function getCopilotPackageDetail(id: string): Promise<CopilotPackageDetail> {
  const res = await client.executeAsync<Record<string, unknown>, CopilotPackageDetail>({
    connectorOperation: {
      tableName: DATA_SOURCE,
      operationName: "GetCopilotPackageDetail",
      parameters: { id },
    },
  });
  if (!res.success) throw res.error ?? new Error(`Failed to get package ${id}`);
  if (!res.data) throw new Error(`Package ${id} returned no data`);
  return res.data;
}

function asStringList(v: unknown, pick?: (o: Record<string, unknown>) => unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const val = pick ? pick(o) : (o.name ?? o.title ?? o.displayName ?? o.text ?? o.id);
      if (typeof val === "string") out.push(val);
    }
  }
  return out;
}

/**
 * Parse the declarative-agent setup data out of a package detail. The agent
 * definition lives in `elementDetails[].elements[].definition` as a JSON string;
 * shapes vary across versions so we read defensively and surface whatever exists.
 */
export function parseAgentSetup(detail: CopilotPackageDetail): AgentSetup {
  const setup: AgentSetup = {
    conversationStarters: [],
    capabilities: [],
    knowledge: [],
    actions: [],
    raw: [],
  };

  for (const ed of detail.elementDetails ?? []) {
    for (const el of ed.elements ?? []) {
      if (!el.definition) continue;
      setup.raw.push({ elementType: ed.elementType ?? "unknown", json: el.definition });

      let def: Record<string, unknown>;
      try {
        def = JSON.parse(el.definition) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Prefer the declarative-agent element for the headline fields.
      const isAgent = (ed.elementType ?? "").toLowerCase().includes("declarativeagent");
      if (isAgent || setup.name === undefined) {
        if (typeof def.name === "string") setup.name = def.name;
        if (typeof def.version === "string") setup.version = def.version;
        if (typeof def.description === "string") setup.description = def.description;
        if (typeof def.instructions === "string") setup.instructions = def.instructions;
      }

      // Conversation starters: array of { title/text }.
      const cs = def.conversation_starters ?? def.conversationStarters;
      setup.conversationStarters.push(...asStringList(cs, (o) => o.title ?? o.text));

      // Capabilities / knowledge: array of { name/type } — knowledge often nested under capabilities.
      const caps = def.capabilities;
      setup.capabilities.push(...asStringList(caps, (o) => o.name ?? o.type));
      if (Array.isArray(caps)) {
        for (const c of caps) {
          if (c && typeof c === "object") {
            const co = c as Record<string, unknown>;
            const t = String(co.name ?? co.type ?? "").toLowerCase();
            if (/knowledge|search|graph|web|sharepoint|onedrive|file|dataverse/.test(t)) {
              const label = String(co.name ?? co.type);
              if (label) setup.knowledge.push(label);
            }
          }
        }
      }

      // Actions / plugins / tools.
      const actions = def.actions ?? def.plugins ?? def.tools;
      setup.actions.push(...asStringList(actions, (o) => o.name ?? o.id));
    }
  }

  // De-dupe.
  setup.conversationStarters = [...new Set(setup.conversationStarters)];
  setup.capabilities = [...new Set(setup.capabilities)];
  setup.knowledge = [...new Set(setup.knowledge)];
  setup.actions = [...new Set(setup.actions)];
  return setup;
}
