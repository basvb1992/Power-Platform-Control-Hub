/**
 * Prompts tab — inventory of AI Builder / Copilot Studio prompts with cross-reference.
 *
 * For each prompt it shows its status and which agents/tools reference it directly.
 * Prompts referenced only from inside a flow definition surface with no direct
 * agent use (flagged, not treated as unused). Expand a row for the agents/tools.
 */
import { useMemo, useState } from "react";
import type { AgentInventoryItem } from "../lib/data";
import type { ToolRef } from "../lib/agentTools";
import type { PromptModel } from "../lib/prompts";
import { rollupPrompts, type PromptRollup } from "../lib/prompts";
import { shortDate } from "../lib/format";

type SortKey = "name" | "usedBy" | "status" | "created";

export function Prompts({
  prompts,
  tools,
  items,
  instanceUrl,
}: {
  prompts: PromptModel[];
  tools: ToolRef[];
  items: AgentInventoryItem[];
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
    () => rollupPrompts(prompts, tools, botNameById),
    [prompts, tools, botNameById]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rollups.filter(
          (r) =>
            r.prompt.name.toLowerCase().includes(q) ||
            r.usedByAgents.some((u) => u.agentName.toLowerCase().includes(q))
        )
      : rollups.slice();
    return sortRollups(list, sort);
  }, [rollups, search, sort]);

  const referenced = rollups.filter((r) => !r.noDirectAgentUse).length;

  return (
    <div className="card">
      <div className="flex-between">
        <h2>Prompts ({rollups.length})</h2>
        <div className="conv-tools">
          <input
            className="conv-search"
            placeholder="Search prompts or agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <p className="muted">
        {referenced} referenced directly by an agent tool · {rollups.length - referenced}{" "}
        with no direct agent reference (may be used inside a flow).
      </p>

      {filtered.length === 0 ? (
        <p className="muted">No prompts match.</p>
      ) : (
        <table className="subtable">
          <thead>
            <tr>
              <th className="sortable" onClick={() => setSort("name")}>
                Prompt
              </th>
              <th className="sortable" onClick={() => setSort("status")}>
                Status
              </th>
              <th className="sortable num" onClick={() => setSort("usedBy")}>
                Used by
              </th>
              <th className="sortable" onClick={() => setSort("created")}>
                Created
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isOpen = open === r.prompt.id;
              return (
                <PromptRow
                  key={r.prompt.id}
                  r={r}
                  isOpen={isOpen}
                  onToggle={() => setOpen(isOpen ? null : r.prompt.id)}
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

function PromptRow({
  r,
  isOpen,
  onToggle,
  instanceUrl,
}: {
  r: PromptRollup;
  isOpen: boolean;
  onToggle: () => void;
  instanceUrl: string;
}) {
  const { prompt, usedByAgents, noDirectAgentUse } = r;
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td>
          <strong>{prompt.name || "(unnamed prompt)"}</strong>
          {noDirectAgentUse && (
            <span className="pill warn" style={{ marginLeft: 6 }}>no agent ref</span>
          )}
        </td>
        <td>
          <span className={prompt.isActive ? "pill kind" : "pill"}>{prompt.status || "—"}</span>
        </td>
        <td className="num">{usedByAgents.length || "—"}</td>
        <td className="muted">{shortDate(prompt.createdon)}</td>
        <td>
          <a
            className="linkbtn"
            href={`${instanceUrl}/main.aspx?pagetype=entityrecord&etn=msdyn_aimodel&id=${prompt.id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open prompt in Dataverse"
          >
            ↗
          </a>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={5}>
            <div className="drawer-section" style={{ margin: 0 }}>
              <h3>Referenced by ({usedByAgents.length})</h3>
              {usedByAgents.length === 0 ? (
                <p className="muted">
                  No agent tool references this prompt directly. It may be invoked
                  from inside an agent flow or a Power App.
                </p>
              ) : (
                <div className="miniconv">
                  {usedByAgents.map((u, i) => (
                    <div key={i} className="conn-card" style={{ marginBottom: 6 }}>
                      <div className="name">{u.agentName}</div>
                      <div className="meta">via tool “{u.toolName}”</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function sortRollups(list: PromptRollup[], key: SortKey): PromptRollup[] {
  const arr = list.slice();
  switch (key) {
    case "name":
      return arr.sort((a, b) => a.prompt.name.localeCompare(b.prompt.name));
    case "status":
      return arr.sort((a, b) => a.prompt.status.localeCompare(b.prompt.status));
    case "created":
      return arr.sort((a, b) => b.prompt.createdon.localeCompare(a.prompt.createdon));
    case "usedBy":
    default:
      return arr.sort((a, b) => b.usedByAgents.length - a.usedByAgents.length);
  }
}
