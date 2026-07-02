/**
 * Copilot Studio deep-analytics hub — the "extend" layer grafted onto the
 * Power Platform Control Hub fork.
 *
 * Daniel's hub gives tenant-wide inventory breadth; this hub gives Copilot
 * Studio depth: pick any environment, then drill into fleet health (Control
 * Tower), cost/credit modeling, conversation replay + orchestration trace, and
 * governance — all read live from that environment's Dataverse via the
 * cross-environment connector.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Resource } from "../types/inventory.ts";
import { getEnvironmentDataverseInfo } from "../services/copilotStudioService.ts";
import {
  fetchBots,
  fetchRuns,
  fetchBotComponents,
  fetchConnectionReferences,
  fetchAgentFlows,
  fetchPrompts,
  fetchAgentTools,
  type AgentInventoryItem,
  type BotData,
} from "./lib/data.ts";
import type { AgentFlow } from "./lib/agentFlows.ts";
import type { PromptModel } from "./lib/prompts.ts";
import type { ToolRef } from "./lib/agentTools.ts";
import {
  totals,
  aggregateByAgent,
  aggregateByKind,
  aggregateByOwner,
  trendByDay,
  creditDistribution,
  runCredits,
  DEFAULT_COST_MODEL,
  type CostModel,
  type RunInfo,
} from "./lib/costEngine.ts";
import { rollupComponents, type BotComponent } from "./lib/botComponents.ts";
import type { ConnectionRef } from "./lib/connections.ts";
import { daysAgoIso, todayIso } from "./lib/format.ts";
import { ControlTower, type TowerNav } from "./components/ControlTower.tsx";
import { ConversationsPage } from "./components/Conversations.tsx";
import { GovernancePanel } from "./components/Governance.tsx";
import { AgentDrawer } from "./components/AgentDetail.tsx";
import { M365AgentsPanel } from "./components/M365Agents.tsx";
import { AgentFlows } from "./components/AgentFlows.tsx";
import { Prompts } from "./components/Prompts.tsx";
import {
  SummaryCards,
  ByAgentTable,
  TrendChart,
  ByKindCard,
  ByOwnerCard,
  DistributionCard,
  AnomalyPanel,
  BudgetCard,
} from "./components/Dashboard.tsx";
import TabInfo from "../components/TabInfo.tsx";
import "./theme.css";

type SubTab =
  | "tower"
  | "cost"
  | "conversations"
  | "governance"
  | "agents"
  | "flows"
  | "prompts"
  | "m365";
const SUBTABS: [SubTab, string][] = [
  ["tower", "Control Tower"],
  ["cost", "Cost"],
  ["conversations", "Conversations"],
  ["governance", "Governance"],
  ["agents", "Agents"],
  ["flows", "Agent flows"],
  ["prompts", "Prompts"],
  ["m365", "M365 Agents"],
];

/** Short "what is this sub-tab for" copy, shown in a collapsed explainer per tab. */
const SUBTAB_INFO: Record<SubTab, { title: string; body: ReactNode }> = {
  tower: {
    title: "What is the Control Tower?",
    body: (
      <p>
        An at-a-glance control plane for the selected environment: overall fleet
        health, open governance risk, cost-versus-budget and a “needs attention”
        inbox. Click any item to jump into the matching deep-dive tab.
      </p>
    ),
  },
  cost: {
    title: "What is the Cost tab?",
    body: (
      <p>
        Models Copilot Studio consumption for the query window. Each completed
        orchestration step is priced using the <strong>credits / step</strong>
        {" "}and <strong>currency / credit</strong> values in the toolbar, then
        broken down by agent, kind, owner and day so you can spot cost drivers.
      </p>
    ),
  },
  conversations: {
    title: "What is the Conversations tab?",
    body: (
      <p>
        Replays individual conversation transcripts in the window and shows the
        underlying orchestration trace — useful for auditing behaviour and
        understanding why a run consumed the credits it did.
      </p>
    ),
  },
  governance: {
    title: "What is the Governance tab?",
    body: (
      <p>
        Surfaces governance findings for the environment’s agents — authentication
        posture, premium/unmanaged connectors and ownership gaps — ranked by
        severity so you can prioritise remediation.
      </p>
    ),
  },
  agents: {
    title: "What is the Agents tab?",
    body: (
      <p>
        The full agent (bot) inventory for the selected environment with state,
        owner, conversation volume and modeled credits. Search or filter, and open
        any agent for its components and details.
      </p>
    ),
  },
  flows: {
    title: "What is the Agent flows tab?",
    body: (
      <p>
        Every Power Automate / agent flow in the environment, cross-referenced to
        the agents and tools that call it. Each row shows what the flow does, which
        agents use it (or that it triggers), and its runtime outcome — invocations,
        failures and credits — from the loaded transcripts. Expand a row to see the
        exact agents and tools.
      </p>
    ),
  },
  prompts: {
    title: "What is the Prompts tab?",
    body: (
      <p>
        The AI Builder / Copilot Studio prompts in the environment, cross-referenced
        to the agents and tools that reference them directly. Prompts used only
        inside a flow are flagged as having no direct agent reference. Expand a row
        to see which agents and tools use each prompt.
      </p>
    ),
  },
  m365: {
    title: "What is the M365 Agents tab?",
    body: (
      <p>
        Lists Microsoft 365 Copilot agents available in the tenant. This view is
        tenant-scoped and does not require selecting an environment or loading data.
      </p>
    ),
  },
};

/** Environment id (the Inventory API uses the resource `name` as the GUID). */
function envId(e: Resource): string {
  return e.name ?? (e.id ?? "");
}
function envLabel(e: Resource): string {
  return e.properties?.displayName ?? e.name ?? "(unnamed)";
}

export default function CopilotStudioHub({ environments }: { environments: Resource[] }) {
  const envs = useMemo(
    () => [...environments].sort((a, b) => envLabel(a).localeCompare(envLabel(b))),
    [environments]
  );

  const [selectedEnv, setSelectedEnv] = useState<string>("");
  const [tab, setTab] = useState<SubTab>("tower");

  // query window
  const [fromIso, setFromIso] = useState(daysAgoIso(30));
  const [toIso, setToIso] = useState(todayIso());
  const [max, setMax] = useState(500);
  const [model, setModel] = useState<CostModel>(DEFAULT_COST_MODEL);
  const [budget, setBudget] = useState(0);

  // data
  const [botData, setBotData] = useState<BotData | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [components, setComponents] = useState<BotComponent[]>([]);
  const [connRefs, setConnRefs] = useState<ConnectionRef[]>([]);
  const [agentFlows, setAgentFlows] = useState<AgentFlow[]>([]);
  const [prompts, setPrompts] = useState<PromptModel[]>([]);
  const [agentTools, setAgentTools] = useState<ToolRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openAgent, setOpenAgent] = useState<AgentInventoryItem | null>(null);
  const [instanceUrl, setInstanceUrl] = useState<string>("");
  const [agentSearch, setAgentSearch] = useState("");
  const [agentState, setAgentState] = useState("");
  const [agentSort, setAgentSort] = useState<{ key: "name" | "state" | "owner" | "conversations" | "credits"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  async function load() {
    if (!selectedEnv) return;
    setLoading(true);
    setError(null);
    setOpenAgent(null);
    try {
      const info = await getEnvironmentDataverseInfo(selectedEnv);
      const instanceUrl = info?.instanceUrl;
      if (!instanceUrl) {
        throw new Error(
          info?.dataverseError ||
            "This environment has no Dataverse instance (no Copilot Studio data)."
        );
      }
      const bd = await fetchBots(instanceUrl);
      setBotData(bd);
      setInstanceUrl(instanceUrl);
      const [r, comps, refs, flows, promptsList, tools] = await Promise.all([
        fetchRuns(instanceUrl, { fromIso, toIso, max }, bd.botMap),
        fetchBotComponents(instanceUrl).catch((err) => {
          console.warn("[CopilotStudioHub] fetchBotComponents failed (non-fatal):", err);
          return [] as BotComponent[];
        }),
        fetchConnectionReferences(instanceUrl).catch((err) => {
          console.warn("[CopilotStudioHub] fetchConnectionReferences failed (non-fatal):", err);
          return [] as ConnectionRef[];
        }),
        fetchAgentFlows(instanceUrl).catch((err) => {
          console.warn("[CopilotStudioHub] fetchAgentFlows failed (non-fatal):", err);
          return [] as AgentFlow[];
        }),
        fetchPrompts(instanceUrl).catch((err) => {
          console.warn("[CopilotStudioHub] fetchPrompts failed (non-fatal):", err);
          return [] as PromptModel[];
        }),
        fetchAgentTools(instanceUrl).catch((err) => {
          console.warn("[CopilotStudioHub] fetchAgentTools failed (non-fatal):", err);
          return [] as ToolRef[];
        }),
      ]);
      setRuns(r);
      setComponents(comps);
      setConnRefs(refs);
      setAgentFlows(flows);
      setPrompts(promptsList);
      setAgentTools(tools);
      setHasLoaded(true);
    } catch (e) {
      console.error("[CopilotStudioHub] load failed for environment", selectedEnv, e);
      setBotData(null);
      setRuns([]);
      setComponents([]);
      setConnRefs([]);
      setAgentFlows([]);
      setPrompts([]);
      setAgentTools([]);
      setError((e as Error)?.message ?? "Failed to load Copilot Studio data");
    } finally {
      setLoading(false);
    }
  }

  // default to the first environment once the list arrives (no auto-fetch —
  // the user reviews the selection and query window, then clicks Load).
  useEffect(() => {
    if (!selectedEnv && envs.length > 0) setSelectedEnv(envId(envs[0]));
  }, [envs, selectedEnv]);

  const inventory = useMemo(() => botData?.inventory ?? [], [botData]);
  const t = useMemo(() => totals(runs), [runs]);
  const modelBySchema = useMemo(() => botData?.modelBySchema ?? {}, [botData]);
  const byAgent = useMemo(() => aggregateByAgent(runs, modelBySchema), [runs, modelBySchema]);
  const trend = useMemo(() => trendByDay(runs), [runs]);
  const byKind = useMemo(() => aggregateByKind(runs), [runs]);
  const distribution = useMemo(() => creditDistribution(runs), [runs]);
  const ownerBySchema = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of inventory) if (b.schemaname && b.owner) m[b.schemaname.toLowerCase()] = b.owner;
    return m;
  }, [inventory]);
  const byOwner = useMemo(() => aggregateByOwner(runs, ownerBySchema), [runs, ownerBySchema]);
  const componentsByBot = useMemo(() => rollupComponents(components), [components]);

  function runsForAgent(item: AgentInventoryItem): RunInfo[] {
    const schema = item.schemaname.toLowerCase();
    return runs.filter((r) => r.agentSchema.toLowerCase() === schema || r.agentLabel === item.name);
  }
  function creditsForAgent(item: AgentInventoryItem): number {
    return runsForAgent(item).reduce((s, r) => s + runCredits(r), 0);
  }

  const filteredSortedAgents = useMemo(() => {
    const filtered = inventory.filter(
      (i) =>
        (!agentState || i.state === agentState) &&
        (!agentSearch ||
          i.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
          (i.owner || "").toLowerCase().includes(agentSearch.toLowerCase()))
    );
    const val = (i: AgentInventoryItem): string | number => {
      switch (agentSort.key) {
        case "name": return i.name.toLowerCase();
        case "state": return (i.state || "").toLowerCase();
        case "owner": return (i.owner || "").toLowerCase();
        case "conversations": return runsForAgent(i).length;
        case "credits": return creditsForAgent(i);
      }
    };
    const mul = agentSort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, agentState, agentSearch, agentSort, runs]);

  function toggleSort(key: typeof agentSort.key) {
    setAgentSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "conversations" || key === "credits" ? "desc" : "asc" }
    );
  }
  function sortIndicator(key: typeof agentSort.key): string {
    return agentSort.key === key ? (agentSort.dir === "asc" ? " ▲" : " ▼") : "";
  }

  return (
    <div className="cs-hub">
      <div className="cs-toolbar">
        <div className="cs-field">
          <label htmlFor="cs-env">Environment</label>
          <select id="cs-env" value={selectedEnv} onChange={(e) => setSelectedEnv(e.target.value)}>
            {envs.length === 0 && <option value="">No environments</option>}
            {envs.map((e) => (
              <option key={envId(e)} value={envId(e)}>
                {envLabel(e)}
              </option>
            ))}
          </select>
        </div>
        <div className="cs-field">
          <label htmlFor="cs-from">From</label>
          <input id="cs-from" type="date" value={fromIso} onChange={(e) => setFromIso(e.target.value)} />
        </div>
        <div className="cs-field">
          <label htmlFor="cs-to">To</label>
          <input id="cs-to" type="date" value={toIso} onChange={(e) => setToIso(e.target.value)} />
        </div>
        <div className="cs-field">
          <label htmlFor="cs-max">Max</label>
          <input
            id="cs-max"
            type="number"
            min={1}
            value={max}
            onChange={(e) => setMax(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="cs-field">
          <label htmlFor="cs-ppc">{model.currency} / credit</label>
          <input
            id="cs-ppc"
            type="number"
            min={0}
            step={0.001}
            value={model.pricePerCredit}
            onChange={(e) => setModel((m) => ({ ...m, pricePerCredit: Math.max(0, Number(e.target.value) || 0) }))}
          />
        </div>
        <button className="btn" onClick={load} disabled={loading || !selectedEnv}>
          {loading ? (
            <>
              <span className="spinner" /> Loading…
            </>
          ) : (
            "Load"
          )}
        </button>
      </div>

      {error && <p className="err" style={{ padding: "0 16px" }}>{error}</p>}

      <div className="cs-costbasis" role="note" hidden={tab === "m365" || tab === "prompts"}>
        <span className="cs-cb-chip">Credits</span>
        <span className="cs-cb-eq">=</span>
        <strong>metered per message from each transcript</strong>
        <span className="cs-cb-sep">·</span>
        <span className="muted">
          classic 1 · generative 2 · agent action 5 · tenant graph 10 · agent flow 13/100 · failed 0
        </span>
        {model.pricePerCredit === 0 && (
          <span className="cs-cb-hint muted">
            — set <strong>{model.currency} / credit</strong> above to see costs in {model.currency}
          </span>
        )}
        <span className="cs-cb-hint muted" style={{ flexBasis: "100%", marginTop: 4 }}>
          ⚠ Deep-reasoning / premium-model token costs (10 cr / 1,000 tokens) are billed on a separate meter and
          are <em>not</em> recorded in transcripts — agents using a deep reasoning model cost more than shown here.
        </span>
      </div>

      <nav className="cs-subtabs">
        {SUBTABS.map(([id, label]) => (
          <button
            key={id}
            className={`cs-subtab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="cs-content content">
        <TabInfo title={SUBTAB_INFO[tab].title}>{SUBTAB_INFO[tab].body}</TabInfo>

        {tab !== "m365" && !hasLoaded && !loading && (
          <div className="cs-empty">
            <div className="cs-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="8" width="16" height="11" rx="3" />
                <path d="M12 8V4" />
                <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none" />
                <path d="M9 13h.01M15 13h.01" />
                <path d="M1 12v3M23 12v3" />
              </svg>
            </div>
            <h3>Read live Copilot Studio data</h3>
            <p>
              Pick an environment and choose <strong>Load</strong> to explore its agents,
              conversations, orchestration traces and credit costs.
            </p>
          </div>
        )}

        {tab !== "m365" && hasLoaded && inventory.length === 0 && (
          <div className="cs-empty">
            <div className="cs-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <h3>Loaded — but no agents found</h3>
            <p>
              The environment responded successfully, yet returned no Copilot Studio
              agents. This usually means there are none in this environment, or the
              signed-in admin lacks Dataverse access to it. Check the browser console
              for details, or try another environment.
            </p>
          </div>
        )}

        {tab === "m365" && <M365AgentsPanel instanceUrl={instanceUrl} environmentId={selectedEnv} />}

        {hasLoaded && inventory.length > 0 && tab === "tower" && (
          <ControlTower
            items={inventory}
            runs={runs}
            byAgent={byAgent}
            totals={runs.length > 0 ? t : null}
            model={model}
            connRefs={connRefs}
            budget={budget}
            hasLoaded={hasLoaded}
            onNavigate={(n: TowerNav) => {
              if (n === "governance") setTab("governance");
              else if (n === "agents") setTab("agents");
              else if (n === "conversations") setTab("conversations");
              else setTab("cost");
            }}
          />
        )}

        {hasLoaded && inventory.length > 0 && tab === "cost" && (
          <>
            {runs.length === 0 ? (
              <div className="card">
                <p className="muted">No transcripts with billable steps in this window.</p>
              </div>
            ) : (
              <>
                <SummaryCards t={t} model={model} />
                <BudgetCard budget={budget} setBudget={setBudget} usedCredits={t.credits} model={model} />
                <TrendChart points={trend} model={model} />
                <ByAgentTable rows={byAgent} onSelect={(key) => {
                  const it = inventory.find((b) => b.name === key || b.schemaname?.toLowerCase() === key.toLowerCase());
                  if (it) setOpenAgent(it);
                }} />
                <div className="grid-2">
                  <ByKindCard rows={byKind} model={model} />
                  <ByOwnerCard rows={byOwner} model={model} />
                </div>
                <DistributionCard d={distribution} />
                <AnomalyPanel runs={runs} />
              </>
            )}
          </>
        )}

        {hasLoaded && inventory.length > 0 && tab === "conversations" && <ConversationsPage runs={runs} model={model} />}

        {hasLoaded && inventory.length > 0 && tab === "governance" && (
          <GovernancePanel items={inventory} runs={runs} connRefs={connRefs} />
        )}

        {hasLoaded && inventory.length > 0 && tab === "agents" && (
          <div className="card">
            <div className="flex-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ margin: 0 }}>Agents ({filteredSortedAgents.length} of {inventory.length})</h2>
              <div className="conv-tools">
                <input className="conv-search" placeholder="Search agent or owner…" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
                <select value={agentState} onChange={(e) => setAgentState(e.target.value)}>
                  <option value="">All states</option>
                  {Array.from(new Set(inventory.map((i) => i.state).filter(Boolean))).sort().map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {(agentSearch || agentState) && <button className="linkbtn" onClick={() => { setAgentSearch(""); setAgentState(""); }}>Clear filters</button>}
              </div>
            </div>
            {inventory.length === 0 ? (
              <p className="muted">No agents found in this environment.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => toggleSort("name")} title="Sort by agent">Agent{sortIndicator("name")}</th>
                    <th className="sortable" onClick={() => toggleSort("state")} title="Sort by state">State{sortIndicator("state")}</th>
                    <th className="sortable" onClick={() => toggleSort("owner")} title="Sort by owner">Owner{sortIndicator("owner")}</th>
                    <th className="num sortable" onClick={() => toggleSort("conversations")} title="Sort by conversations">Conversations{sortIndicator("conversations")}</th>
                    <th className="num sortable" onClick={() => toggleSort("credits")} title="Sort by credits">Credits{sortIndicator("credits")}</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedAgents
                    .map((item) => {
                    const ar = runsForAgent(item);
                    return (
                      <tr
                        key={item.botid}
                        className="clickable"
                        onClick={() => setOpenAgent(item)}
                      >
                        <td>{item.name}</td>
                        <td>{item.state}</td>
                        <td>{item.owner || "—"}</td>
                        <td className="num">{ar.length}</td>
                        <td className="num">{creditsForAgent(item).toLocaleString()}</td>
                        <td>
                          {instanceUrl && (
                            <a href={`${instanceUrl}/main.aspx?pagetype=entityrecord&etn=bot&id=${item.botid}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Dataverse">↗</a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {hasLoaded && inventory.length > 0 && tab === "flows" && (
          <AgentFlows
            flows={agentFlows}
            tools={agentTools}
            runs={runs}
            items={inventory}
            model={model}
            instanceUrl={instanceUrl}
          />
        )}

        {hasLoaded && inventory.length > 0 && tab === "prompts" && (
          <Prompts
            prompts={prompts}
            tools={agentTools}
            items={inventory}
            instanceUrl={instanceUrl}
          />
        )}
      </div>

      {openAgent && (
        <AgentDrawer
          item={openAgent}
          roll={componentsByBot[openAgent.botid]}
          credits={creditsForAgent(openAgent)}
          runs={runsForAgent(openAgent)}
          allRuns={runs}
          connRefs={connRefs}
          model={model}
          envId={selectedEnv}
          instanceUrl={instanceUrl}
          onChanged={() => void load()}
          onClose={() => setOpenAgent(null)}
        />
      )}
    </div>
  );
}
