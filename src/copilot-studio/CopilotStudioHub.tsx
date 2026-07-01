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
import type { Resource } from "../types/inventory.ts";
import { getEnvironmentDataverseInfo } from "../services/copilotStudioService.ts";
import {
  fetchBots,
  fetchRuns,
  fetchBotComponents,
  fetchConnectionReferences,
  type AgentInventoryItem,
  type BotData,
} from "./lib/data.ts";
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
import { daysAgoIso, todayIso, money } from "./lib/format.ts";
import { ControlTower, type TowerNav } from "./components/ControlTower.tsx";
import { ConversationsPage } from "./components/Conversations.tsx";
import { GovernancePanel } from "./components/Governance.tsx";
import { AgentDrawer } from "./components/AgentDetail.tsx";
import { M365AgentsPanel } from "./components/M365Agents.tsx";
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
import "./theme.css";

type SubTab = "tower" | "cost" | "conversations" | "governance" | "agents" | "m365";
const SUBTABS: [SubTab, string][] = [
  ["tower", "Control Tower"],
  ["cost", "Cost"],
  ["conversations", "Conversations"],
  ["governance", "Governance"],
  ["agents", "Agents"],
  ["m365", "M365 Agents"],
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openAgent, setOpenAgent] = useState<AgentInventoryItem | null>(null);
  const [instanceUrl, setInstanceUrl] = useState<string>("");
  const [agentSearch, setAgentSearch] = useState("");
  const [agentState, setAgentState] = useState("");

  // default to the first environment once the list arrives
  useEffect(() => {
    if (!selectedEnv && envs.length > 0) setSelectedEnv(envId(envs[0]));
  }, [envs, selectedEnv]);

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
      const [r, comps, refs] = await Promise.all([
        fetchRuns(instanceUrl, { fromIso, toIso, max }, bd.botMap),
        fetchBotComponents(instanceUrl).catch(() => [] as BotComponent[]),
        fetchConnectionReferences(instanceUrl).catch(() => [] as ConnectionRef[]),
      ]);
      setRuns(r);
      setComponents(comps);
      setConnRefs(refs);
      setHasLoaded(true);
    } catch (e) {
      setBotData(null);
      setRuns([]);
      setComponents([]);
      setConnRefs([]);
      setError((e as Error)?.message ?? "Failed to load Copilot Studio data");
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch once when the first environment is selected so the page fills on load.
  useEffect(() => {
    if (selectedEnv && !hasLoaded && !loading && !error) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnv]);

  const inventory = useMemo(() => botData?.inventory ?? [], [botData]);
  const cps = model.creditPerStep;
  const t = useMemo(() => totals(runs, cps), [runs, cps]);
  const byAgent = useMemo(() => aggregateByAgent(runs, cps), [runs, cps]);
  const trend = useMemo(() => trendByDay(runs, cps), [runs, cps]);
  const byKind = useMemo(() => aggregateByKind(runs, cps), [runs, cps]);
  const distribution = useMemo(() => creditDistribution(runs, cps), [runs, cps]);
  const ownerBySchema = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of inventory) if (b.schemaname && b.owner) m[b.schemaname.toLowerCase()] = b.owner;
    return m;
  }, [inventory]);
  const byOwner = useMemo(() => aggregateByOwner(runs, ownerBySchema, cps), [runs, ownerBySchema, cps]);
  const componentsByBot = useMemo(() => rollupComponents(components), [components]);

  function runsForAgent(item: AgentInventoryItem): RunInfo[] {
    const schema = item.schemaname.toLowerCase();
    return runs.filter((r) => r.agentSchema.toLowerCase() === schema || r.agentLabel === item.name);
  }
  function creditsForAgent(item: AgentInventoryItem): number {
    return runsForAgent(item).reduce((s, r) => s + runCredits(r, cps), 0);
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
          <label htmlFor="cs-cps">Credits / step</label>
          <input
            id="cs-cps"
            type="number"
            min={0}
            value={model.creditPerStep}
            onChange={(e) => setModel((m) => ({ ...m, creditPerStep: Math.max(0, Number(e.target.value) || 0) }))}
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

      <div className="cs-costbasis" role="note" hidden={tab === "m365"}>
        <span className="cs-cb-chip">1 completed step</span>
        <span className="cs-cb-eq">=</span>
        <strong>{model.creditPerStep} credits</strong>
        {model.pricePerCredit > 0 && (
          <>
            <span className="cs-cb-eq">=</span>
            <strong>{money(model.creditPerStep, model)}</strong>
          </>
        )}
        <span className="cs-cb-sep">·</span>
        <span className="muted">failed step = 0 credits</span>
        {model.pricePerCredit === 0 && (
          <span className="cs-cb-hint muted">
            — set <strong>{model.currency} / credit</strong> above to see costs in {model.currency}
          </span>
        )}
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

        {tab === "m365" && <M365AgentsPanel />}

        {hasLoaded && tab === "tower" && (
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

        {hasLoaded && tab === "cost" && (
          <>
            {runs.length === 0 ? (
              <div className="card">
                <p className="muted">No transcripts with billable steps in this window.</p>
              </div>
            ) : (
              <>
                <SummaryCards t={t} model={model} />
                <BudgetCard budget={budget} setBudget={setBudget} usedCredits={t.modeledCredits} model={model} />
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
                <AnomalyPanel runs={runs} model={model} />
              </>
            )}
          </>
        )}

        {hasLoaded && tab === "conversations" && <ConversationsPage runs={runs} model={model} />}

        {hasLoaded && tab === "governance" && (
          <GovernancePanel items={inventory} runs={runs} connRefs={connRefs} />
        )}

        {hasLoaded && tab === "agents" && (
          <div className="card">
            <div className="flex-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ margin: 0 }}>Agents ({inventory.filter((i) => (!agentState || i.state === agentState) && (!agentSearch || i.name.toLowerCase().includes(agentSearch.toLowerCase()) || (i.owner || "").toLowerCase().includes(agentSearch.toLowerCase()))).length} of {inventory.length})</h2>
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
                    <th>Agent</th>
                    <th>State</th>
                    <th>Owner</th>
                    <th className="num">Conversations</th>
                    <th className="num">Credits</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory
                    .filter((i) => (!agentState || i.state === agentState) && (!agentSearch || i.name.toLowerCase().includes(agentSearch.toLowerCase()) || (i.owner || "").toLowerCase().includes(agentSearch.toLowerCase())))
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
