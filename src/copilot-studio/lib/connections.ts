/**
 * Connection-reference model + attribution helpers.
 * A connection reference links an agent (or flow) to a connector instance.
 * Many references encode the owning agent schema as a prefix:
 *   "vbd_UnicaProjectCoach.shared_powertools.shared-powertools-…"
 * We attribute a reference to an agent by that prefix, and surface the connector
 * from the connectorid path ("/providers/.../apis/shared_powertools").
 */

export interface ConnectionRef {
  displayName: string;
  logicalName: string;
  connectorId: string;
}

/** Premium / standalone-license connectors (best-effort, extend as needed). */
const PREMIUM_CONNECTORS = new Set([
  "shared_powertools",
  "shared_computeroperator",
  "shared_a365memcp",
  "shared_sql",
  "shared_azureopenai",
  "shared_documentdb",
  "shared_servicebus",
  "shared_http",
  "shared_customconnector",
]);

/** Connectors that are core/free plumbing — never flagged premium. */
const STANDARD_CONNECTORS = new Set([
  "shared_commondataserviceforapps",
  "shared_teams",
  "shared_office365",
  "shared_office365users",
  "shared_m365copilotv2",
  "shared_microsoftcopilotstudio",
  "shared_powerappsnotificationv2",
]);

/** Last path segment of a connectorid, e.g. "shared_powertools". */
export function connectorKey(connectorId: string): string {
  const parts = String(connectorId).split("/").filter(Boolean);
  return parts[parts.length - 1] || connectorId;
}

/** Human label for a connector key: drop "shared_" and prettify. */
export function connectorLabel(connectorId: string): string {
  const key = connectorKey(connectorId).replace(/^shared[_-]/i, "");
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\bv2\b/i, "")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function isPremiumConnector(connectorId: string): boolean {
  const key = connectorKey(connectorId);
  if (STANDARD_CONNECTORS.has(key)) return false;
  return PREMIUM_CONNECTORS.has(key);
}

/** Pull the owning agent schema from a reference name, if it encodes one. */
export function agentSchemaOfRef(ref: ConnectionRef): string | null {
  const src = ref.logicalName || ref.displayName || "";
  const m = src.match(/^([a-z0-9]+_[A-Za-z0-9]+)\./);
  return m ? m[1] : null;
}

export interface ConnectorRollup {
  key: string;
  label: string;
  connectorId: string;
  premium: boolean;
  count: number;
  agents: string[]; // schema names attributed
}

/** Group references by connector, collecting attributed agent schemas. */
export function rollupByConnector(refs: ConnectionRef[]): ConnectorRollup[] {
  const map = new Map<string, ConnectorRollup>();
  for (const ref of refs) {
    const key = connectorKey(ref.connectorId);
    let r = map.get(key);
    if (!r) {
      r = {
        key,
        label: connectorLabel(ref.connectorId),
        connectorId: ref.connectorId,
        premium: isPremiumConnector(ref.connectorId),
        count: 0,
        agents: [],
      };
      map.set(key, r);
    }
    r.count++;
    const schema = agentSchemaOfRef(ref);
    if (schema && !r.agents.includes(schema)) r.agents.push(schema);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** References attributed to a specific agent schema (case-insensitive). */
export function refsForAgent(refs: ConnectionRef[], schema: string): ConnectionRef[] {
  const s = schema.toLowerCase();
  return refs.filter((r) => (agentSchemaOfRef(r) ?? "").toLowerCase() === s);
}
