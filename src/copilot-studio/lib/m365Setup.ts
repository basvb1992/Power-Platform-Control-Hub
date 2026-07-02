/**
 * M365 Copilot connector — setup state detection.
 *
 * The "M365 Agents" tab needs a one-time, tenant-specific setup (Entra app
 * registration, the `m365copilotpackages` custom connector, a connection, and a
 * Microsoft Agent 365 license). Most of those steps are maker-portal / admin
 * actions that can't be automated, so instead of failing with a raw error the
 * tab shows a guided checklist whose statuses are detected live:
 *
 *   1. probeConnector() calls the connector once and classifies the outcome
 *      (ready / connector-not-wired / not-connected / no-access) from the error.
 *   2. readM365Config() reads the NON-SECRET tenant settings (tenant id, client
 *      id) that the admin stores as environment variables, so the tab can show
 *      what's filled in and what's missing.
 *
 * SECURITY: the OAuth client *secret* is never read or stored here. It is entered
 * by the admin on the connection's Security tab and never lives in an environment
 * variable or in the solution.
 */
import { listRecordsWithOrg } from "../../services/dataverseConnectorService.ts";
import { listCopilotPackages } from "./m365Agents.ts";

/** Outcome of a single probe against the M365 connector. */
export type ProbeKind =
  | "ready" // connector reachable and returning data
  | "connectorMissing" // data source not added to the app
  | "notConnected" // connector present but no/expired connection (auth)
  | "noAccess" // connected but missing permission or Agent 365 license
  | "unknown"; // anything else

export interface ProbeResult {
  kind: ProbeKind;
  message: string;
}

/** Classify a connector error message into a setup-relevant outcome. */
export function classifyProbeError(message: string): ProbeKind {
  const m = String(message || "").toLowerCase();
  if (/data source not found|unable to find data source|m365copilotpackages/.test(m)) return "connectorMissing";
  if (/\b401\b|unauthorized|not signed in|no connection|token|expired|invalid_grant/.test(m)) return "notConnected";
  if (/\b403\b|forbidden|permission|consent|copilotpackages\.read|license|not licensed|agent 365/.test(m))
    return "noAccess";
  if (/\b404\b|not found/.test(m)) return "noAccess"; // beta endpoint / license gating often surfaces as 404
  return "unknown";
}

/** Call the connector once and report whether M365 agent data can be read. */
export async function probeConnector(): Promise<ProbeResult> {
  try {
    await listCopilotPackages({ agentsOnly: true });
    return { kind: "ready", message: "Connector reachable — M365 Copilot agents can be read." };
  } catch (e) {
    const message = (e as Error)?.message ?? "Unknown connector error";
    return { kind: classifyProbeError(message), message };
  }
}

/** A resolved environment-variable value (default overridden by the set value). */
export interface EnvVarState {
  schema: string;
  displayName: string;
  value: string;
  present: boolean;
}

export interface M365Config {
  tenantId?: EnvVarState;
  clientId?: EnvVarState;
  /** True when we could reach Dataverse to read the variables at all. */
  read: boolean;
}

// Match by suffix so any publisher prefix (vbd_, crc35_, …) works.
const TENANT_SUFFIX = "m365copilottenantid";
const CLIENT_SUFFIX = "m365copilotclientid";

/**
 * Read the non-secret tenant config the admin stores as environment variables.
 * Returns `read: false` (not an error) when no environment is selected yet.
 */
export async function readM365Config(instanceUrl?: string): Promise<M365Config> {
  if (!instanceUrl) return { read: false };
  try {
    const defs = await listRecordsWithOrg(instanceUrl, "environmentvariabledefinitions", {
      select: "schemaname,displayname,defaultvalue,environmentvariabledefinitionid,type",
      filter: `endswith(schemaname,'${TENANT_SUFFIX}') or endswith(schemaname,'${CLIENT_SUFFIX}')`,
      top: 50,
    });
    if (defs.length === 0) return { read: true };

    const idByDef: Record<string, string> = {};
    for (const d of defs) idByDef[String(d["environmentvariabledefinitionid"])] = String(d["schemaname"] ?? "");

    // Read explicit values (override defaults) for the matched definitions.
    const valById: Record<string, string> = {};
    try {
      const ids = Object.keys(idByDef);
      const orClause = ids.map((id) => `_environmentvariabledefinitionid_value eq ${id}`).join(" or ");
      const vals = await listRecordsWithOrg(instanceUrl, "environmentvariablevalues", {
        select: "value,_environmentvariabledefinitionid_value",
        filter: orClause,
        top: 50,
      });
      for (const v of vals) valById[String(v["_environmentvariabledefinitionid_value"])] = String(v["value"] ?? "");
    } catch {
      // values are optional; fall back to defaults
    }

    const toState = (suffix: string): EnvVarState | undefined => {
      const def = defs.find((d) => String(d["schemaname"] ?? "").toLowerCase().endsWith(suffix));
      if (!def) return undefined;
      const id = String(def["environmentvariabledefinitionid"]);
      const value = (valById[id] ?? String(def["defaultvalue"] ?? "")).trim();
      return {
        schema: String(def["schemaname"] ?? ""),
        displayName: String(def["displayname"] ?? def["schemaname"] ?? ""),
        value,
        present: value.length > 0,
      };
    };

    return { read: true, tenantId: toState(TENANT_SUFFIX), clientId: toState(CLIENT_SUFFIX) };
  } catch {
    return { read: false };
  }
}

export type StepStatus = "done" | "todo" | "manual" | "blocked";

export interface SetupStep {
  id: string;
  title: string;
  status: StepStatus;
  detail: string;
  /** Optional deep links (docs / portals) for the remediation. */
  links?: { label: string; href: string }[];
}

export interface SetupState {
  ready: boolean;
  probe: ProbeResult;
  config: M365Config;
  steps: SetupStep[];
  /** 0..1 completion for the progress bar. */
  progress: number;
}

const ENTRA_APP_REG =
  "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";
const GRAPH_DOCS =
  "https://learn.microsoft.com/graph/api/resources/copilotadmin?view=graph-rest-beta";

/** Environment-scoped Power Apps maker deep link (falls back to the maker home). */
function makerLink(
  environmentId: string | undefined,
  page: "solutions" | "customconnectors" | "connections"
): string {
  return environmentId
    ? `https://make.powerapps.com/environments/${environmentId}/${page}`
    : "https://make.powerapps.com/";
}

/** Build the ordered setup checklist from a probe + config read. */
export function buildSetupState(
  probe: ProbeResult,
  config: M365Config,
  environmentId?: string
): SetupState {
  const ready = probe.kind === "ready";
  const connectorWired = probe.kind !== "connectorMissing";
  const connected = ready || probe.kind === "noAccess"; // reached the API => a connection exists
  const hasAccess = ready;

  const tenantOk = !!config.tenantId?.present;
  const clientOk = !!config.clientId?.present;

  const steps: SetupStep[] = [
    {
      id: "appreg",
      title: "Register an Entra app with Graph permission",
      status: connected ? "done" : "manual",
      detail: connected
        ? "A working connection was reached, so the app registration and admin consent are in place."
        : "Create an Entra app registration, add the delegated Microsoft Graph permission CopilotPackages.Read.All, and grant admin consent. Note the client id (and create a client secret).",
      links: [
        { label: "Entra app registrations", href: ENTRA_APP_REG },
        { label: "Graph Copilot admin API (beta)", href: GRAPH_DOCS },
      ],
    },
    {
      id: "envvars",
      title: "Fill tenant config (environment variables)",
      status: tenantOk && clientOk ? "done" : config.read ? "todo" : "manual",
      detail:
        tenantOk && clientOk
          ? `Tenant id and client id are set${
              config.tenantId?.displayName ? ` (${config.tenantId.displayName}, ${config.clientId?.displayName})` : ""
            }.`
          : config.read
            ? `Set the non-secret environment variables for tenant id and client id${
                !tenantOk ? " — tenant id is empty" : ""
              }${!clientOk ? `${!tenantOk ? " and" : " —"} client id is empty` : ""}. The secret is NOT stored here.`
            : "Select and load an environment above to check the tenant config variables. These hold non-secret values only (tenant id, client id).",
      links: [{ label: "Power Apps › Solutions", href: makerLink(environmentId, "solutions") }],
    },
    {
      id: "connector",
      title: "Import the m365copilotpackages custom connector",
      status: connectorWired ? "done" : "todo",
      detail: connectorWired
        ? "The connector data source is wired into the app."
        : "Import connectors/m365-copilot-packages/apiDefinition.swagger.json as a custom connector (OAuth 2.0 / Azure AD, resource https://graph.microsoft.com), then add it to the app as data source 'm365copilotpackages'.",
      links: [{ label: "Power Apps › Custom connectors", href: makerLink(environmentId, "customconnectors") }],
    },
    {
      id: "connection",
      title: "Create & authorize a connection",
      status: connected ? "done" : connectorWired ? "todo" : "blocked",
      detail: connected
        ? "A connection is authorized and reachable."
        : connectorWired
          ? "Create a connection to the connector and sign in as an AI or Global administrator. Enter the client secret here — never in an environment variable."
          : "Import the connector first, then create a connection.",
      links: [{ label: "Power Apps › Connections", href: makerLink(environmentId, "connections") }],
    },
    {
      id: "license",
      title: "Microsoft Agent 365 license & permission",
      status: hasAccess ? "done" : connected ? "todo" : "blocked",
      detail: hasAccess
        ? "The tenant is licensed and the sign-in has CopilotPackages.Read.All."
        : connected
          ? "The connection reached the API but was denied. Confirm a Microsoft Agent 365 license and that the signed-in user is an AI/Global admin with CopilotPackages.Read.All."
          : "Complete the connection first.",
      links: [{ label: "Graph Copilot admin API (beta)", href: GRAPH_DOCS }],
    },
  ];

  const weighted = steps.filter((s) => s.status === "done").length;
  const progress = ready ? 1 : weighted / steps.length;

  return { ready, probe, config, steps, progress };
}

/** One-shot: probe + read config + build the checklist. */
export async function evaluateSetup(instanceUrl?: string, environmentId?: string): Promise<SetupState> {
  const [probe, config] = await Promise.all([probeConnector(), readM365Config(instanceUrl)]);
  return buildSetupState(probe, config, environmentId);
}
