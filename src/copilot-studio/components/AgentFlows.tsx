/**
 * Agent flows tab — inventory of Power Automate / agent flows with cross-reference.
 *
 * For each flow it shows what it does (AI-authored description), its state, which
 * agents/tools call it (static, from parsed tool refs) and how it behaved at
 * runtime (invocations / failures / credits, from transcripts). Expand a row to
 * see the exact agents and tools that reference the flow.
 */
import { useMemo, useState } from "react";
import type { AgentInventoryItem } from "../lib/data";
import type { ToolRef } from "../lib/agentTools";
import type { AgentFlow } from "../lib/agentFlows";
import { rollupFlows, type FlowRollup } from "../lib/agentFlows";
import type { RunInfo, CostModel } from "../lib/costEngine";
import { money, shortDate } from "../lib/format";

type SortKey = "name" | "usedBy" | "runs" | "failures" | "state";

export function AgentFlows({
  flows,
  tools,
  runs,
  items,
  model,
  instanceUrl,
}: {
  flows: AgentFlow[];
  tools: ToolRef[];
  runs: RunInfo[];
  items: AgentInventoryItem[];
  model: CostModel;
  instanceUrl: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("usedBy");
  const [open, setOpen] = useState<string | null>(null);

  const botNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of items) m[b.botid] = b.name;
    return m;
  }, [items]);

  const rollups = useMemo(
    () => rollupFlows(flows, tools, runs, botNameById),
    [flows, tools, runs, botNameById]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rollups.filter(
          (r) =>
            r.flow.name.toLowerCase().includes(q) ||
            r.flow.description.toLowerCase().includes(q) ||
            r.usedBy.some((u) => u.agentName.toLowerCase().includes(q))
        )
      : rollups.slice();
    return sortRollups(list, sort);
  }, [rollups, search, sort]);

  const referenced = rollups.filter((r) => !r.orphan).length;
  const triggers = rollups.filter((r) => r.usedBy.some((u) => u.isTrigger)).length;

  return (
    <div className="card">
      <div className="flex-between">
        <h2>Agent flows ({rollups.length})</h2>
        <div className="conv-tools">
          <input
            className="conv-search"
            placeholder="Search flows or agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <p className="muted">
        {referenced} referenced by an agent · {triggers} used as a trigger ·{" "}
        {rollups.length - referenced} with no agent reference.
      </p>

      {filtered.length === 0 ? (
        <p className="muted">No agent flows match.</p>
      ) : (
        <table className="subtable">
          <thead>
            <tr>
              <th className="sortable" onClick={() => setSort("name")}>
                Flow
              </th>
              <th>What it does</th>
              <th className="sortable" onClick={() => setSort("state")}>
                State
              </th>
              <th className="sortable num" onClick={() => setSort("usedBy")}>
                Used by
              </th>
              <th className="sortable num" onClick={() => setSort("runs")}>
                Runs
              </th>
              <th className="sortable num" onClick={() => setSort("failures")}>
                Failed
              </th>
              <th className="num">Credits</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isOpen = open === r.flow.id;
              return (
                <FlowRow
                  key={r.flow.id}
                  r={r}
                  isOpen={isOpen}
                  onToggle={() => setOpen(isOpen ? null : r.flow.id)}
                  model={model}
                  instanceUrl={instanceUrl}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FlowRow({
  r,
  isOpen,
  onToggle,
  model,
  instanceUrl,
}: {
  r: FlowRollup;
  isOpen: boolean;
  onToggle: () => void;
  model: CostModel;
  instanceUrl: string;
}) {
  const { flow, usedBy, runtime, orphan } = r;
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td>
          <strong>{flow.name}</strong>
          {orphan && <span className="pill warn" style={{ marginLeft: 6 }}>no agent ref</span>}
        </td>
        <td className="muted" title={flow.description}>
          {flow.description ? truncate(flow.description, 90) : "—"}
        </td>
        <td>
          <span className={flow.isActive ? "pill kind" : "pill"}>{flow.state || "—"}</span>
        </td>
        <td className="num">{usedBy.length || "—"}</td>
        <td className="num">{runtime.invocations || "—"}</td>
        <td className="num">
          {runtime.failures > 0 ? (
            <span className="pill fail">{runtime.failures}</span>
          ) : (
            "—"
          )}
        </td>
        <td className="num">{runtime.credits ? money(runtime.credits, model) : "—"}</td>
        <td>
          <a
            className="linkbtn"
            href={`${instanceUrl}/main.aspx?pagetype=entityrecord&etn=workflow&id=${flow.id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open flow in Power Automate"
          >
            ↗
          </a>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={8}>
            <div className="drawer-section" style={{ margin: 0 }}>
              <h3>Referenced by ({usedBy.length})</h3>
              {usedBy.length === 0 ? (
                <p className="muted">
                  No agent tool references this flow. It may run standalone, on a
                  schedule, or be called from another flow.
                </p>
              ) : (
                <div className="miniconv">
                  {usedBy.map((u, i) => (
                    <div key={i} className="conn-card" style={{ marginBottom: 6 }}>
                      <div className="name">
                        {u.agentName}
                        {u.isTrigger && <span className="pill kind">trigger</span>}
                      </div>
                      <div className="meta">via tool “{u.toolName}”</div>
                    </div>
                  ))}
                </div>
              )}
              {runtime.invocations > 0 && (
                <p className="muted">
                  Runtime (selected window): {runtime.invocations} invocation
                  {runtime.invocations > 1 ? "s" : ""}, {runtime.successes} ok,{" "}
                  {runtime.failures} failed · last used {shortDate(runtime.lastUsed)}.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function sortRollups(list: FlowRollup[], key: SortKey): FlowRollup[] {
  const arr = list.slice();
  switch (key) {
    case "name":
      return arr.sort((a, b) => a.flow.name.localeCompare(b.flow.name));
    case "state":
      return arr.sort((a, b) => a.flow.state.localeCompare(b.flow.state));
    case "runs":
      return arr.sort((a, b) => b.runtime.invocations - a.runtime.invocations);
    case "failures":
      return arr.sort((a, b) => b.runtime.failures - a.runtime.failures);
    case "usedBy":
    default:
      return arr.sort((a, b) => b.usedBy.length - a.usedBy.length);
  }
}
