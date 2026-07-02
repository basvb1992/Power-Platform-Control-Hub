import { useMemo, useState } from "react";
import type { AgentInventoryItem } from "../lib/data";
import type { AgentComponentRollup } from "../lib/botComponents";
import { CAPABILITY_LABELS, CAPABILITY_ORDER, componentTypeLabel } from "../lib/botComponents";
import type { RunInfo, CostModel } from "../lib/costEngine";
import { isFailedStep, runCredits } from "../lib/costEngine";
import type { ConnectionRef } from "../lib/connections";
import { refsForAgent, connectorLabel, isPremiumConnector } from "../lib/connections";
import { shortDate } from "../lib/format";
import { useSort, sortBy } from "../lib/tableSort";
import { SortTh } from "./SortHeader";
import { ConversationDrawer, groupRuns } from "./Conversations";
import { quarantineBot, unquarantineBot, deleteCopilotAgent } from "../../services/copilotStudioService";

export function AgentDrawer({
  item,
  roll,
  credits,
  runs,
  allRuns,
  connRefs,
  model,
  envId,
  instanceUrl,
  onChanged,
  onClose,
}: {
  item: AgentInventoryItem;
  roll?: AgentComponentRollup;
  credits: number;
  runs: RunInfo[];
  allRuns: RunInfo[];
  connRefs: ConnectionRef[];
  model: CostModel;
  envId?: string;
  instanceUrl?: string;
  onChanged?: () => void;
  onClose: () => void;
}) {
  const [openRun, setOpenRun] = useState<RunInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const { sort: compSort, onSort: onCompSort } = useSort<"name" | "type" | "state">("name");
  const conns = useMemo(() => refsForAgent(connRefs, item.schemaname), [connRefs, item.schemaname]);
  const groups = useMemo(() => groupRuns(allRuns), [allRuns]);
  const agentRuns = useMemo(
    () =>
      [...runs].sort((a, b) =>
        runCredits(b) - runCredits(a)
      ),
    [runs]
  );
  const totalCredits = agentRuns.reduce((s, r) => s + runCredits(r), 0) || credits;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Agent detail">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{item.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{item.schemaname}</div>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {envId && (
          <div className="agent-actions">
            {instanceUrl && (
              <a className="linkbtn" href={`${instanceUrl}/main.aspx?pagetype=entityrecord&etn=bot&id=${item.botid}`} target="_blank" rel="noreferrer">Open in Dataverse</a>
            )}
            <button className="linkbtn" disabled={!!busy} onClick={async () => {
              setActionErr(null); setBusy("q");
              try { await quarantineBot(envId, item.botid); onChanged?.(); } catch (e) { setActionErr((e as Error).message); } finally { setBusy(null); }
            }}>Quarantine</button>
            <button className="linkbtn" disabled={!!busy} onClick={async () => {
              setActionErr(null); setBusy("u");
              try { await unquarantineBot(envId, item.botid); onChanged?.(); } catch (e) { setActionErr((e as Error).message); } finally { setBusy(null); }
            }}>Unquarantine</button>
            {confirmDel ? (
              <>
                <span className="muted" style={{ fontSize: 12 }}>Delete permanently?</span>
                <button className="linkbtn danger" disabled={!!busy} onClick={async () => {
                  setActionErr(null); setBusy("d");
                  try { await deleteCopilotAgent(envId, item.botid); onChanged?.(); onClose(); } catch (e) { setActionErr((e as Error).message); setBusy(null); }
                }}>Confirm delete</button>
                <button className="linkbtn" onClick={() => setConfirmDel(false)}>Cancel</button>
              </>
            ) : (
              <button className="linkbtn danger" disabled={!!busy} onClick={() => setConfirmDel(true)}>Delete</button>
            )}
          </div>
        )}
        {actionErr && <p className="pill fail" style={{ marginTop: 8 }}>{actionErr}</p>}

        <dl className="kv">
          <dt>Owner</dt>
          <dd>{item.owner || "—"}</dd>
          <dt>State</dt>
          <dd>{item.state || "—"}</dd>
          <dt>Published</dt>
          <dd>{item.publishedon ? shortDate(item.publishedon) : "Not published"}</dd>
          <dt>Authentication</dt>
          <dd>{item.authMode || "—"}</dd>
          <dt>Languages</dt>
          <dd>{item.languages || "—"}</dd>
          <dt>Created</dt>
          <dd>{item.createdon ? shortDate(item.createdon) : "—"}</dd>
        </dl>

        <div className="drawer-stats">
          <div className="dstat">
            <div className="v">{roll ? roll.active : "—"}</div>
            <div className="l">Components</div>
          </div>
          <div className="dstat">
            <div className="v">{agentRuns.length}</div>
            <div className="l">Conversations</div>
          </div>
          <div className="dstat">
            <div className="v">{conns.length}</div>
            <div className="l">Connections</div>
          </div>
          <div className="dstat">
            <div className="v">{totalCredits}</div>
            <div className="l">Credits</div>
          </div>
        </div>

        {roll && (
          <div className="drawer-section">
            <h3>Capabilities</h3>
            <div className="pillrow">
              {CAPABILITY_ORDER.filter((k) => roll.byCapability[k] > 0).map((k) => (
                <span className="pill kind" key={k}>
                  {CAPABILITY_LABELS[k]}: {roll.byCapability[k]}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="drawer-section">
          <h3>Connections ({conns.length})</h3>
          {conns.length === 0 ? (
            <p className="muted">No connection references attributed to this agent.</p>
          ) : (
            <div className="miniconv">
              {conns.map((c, i) => (
                <div key={i} className="conn-card" style={{ marginBottom: 6 }}>
                  <div className="name">
                    {connectorLabel(c.connectorId)}
                    {isPremiumConnector(c.connectorId) && <span className="pill warn">premium</span>}
                  </div>
                  <div className="meta">{c.displayName}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="drawer-section">
          <h3>Conversations ({agentRuns.length})</h3>
          {agentRuns.length === 0 ? (
            <p className="muted">
              No conversations loaded for this agent in the selected window.
            </p>
          ) : (
            <div className="miniconv">
              {agentRuns.slice(0, 25).map((r) => {
                const failed = r.steps.filter(isFailedStep).length;
                return (
                  <button key={r.id} onClick={() => setOpenRun(r)}>
                    <span>
                      {shortDate(r.createdon)} · {r.messages.length} turns
                      {failed > 0 && <span className="pill fail" style={{ marginLeft: 6 }}>{failed} failed</span>}
                    </span>
                    <strong>{runCredits(r)} cr</strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {roll && roll.components.length > 0 && (
          <div className="drawer-section">
            <h3>Components ({roll.active})</h3>
            <table className="subtable">
              <thead>
                <tr>
                  <SortTh col="name" label="Component" sort={compSort} onSort={onCompSort} />
                  <SortTh col="type" label="Type" sort={compSort} onSort={onCompSort} />
                  <SortTh col="state" label="State" sort={compSort} onSort={onCompSort} />
                </tr>
              </thead>
              <tbody>
                {sortBy(roll.components, compSort, (c, k) =>
                  k === "name"
                    ? c.name || c.schemaname
                    : k === "type"
                      ? componentTypeLabel(c.componenttype)
                      : c.statecode === 0
                        ? "Active"
                        : "Inactive"
                )
                  .slice(0, 100)
                  .map((c, i) => (
                    <tr key={`${c.schemaname}-${i}`}>
                      <td>{c.name || c.schemaname}</td>
                      <td className="muted">{componentTypeLabel(c.componenttype)}</td>
                      <td>{c.statecode === 0 ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {roll.components.length > 100 && (
              <p className="muted">Showing first 100 of {roll.components.length}.</p>
            )}
          </div>
        )}

        {openRun && (
          <ConversationDrawer
            key={openRun.id}
            run={openRun}
            siblings={groups.get(openRun.conversationId) ?? [openRun]}
            model={model}
            onSelect={setOpenRun}
            onClose={() => setOpenRun(null)}
          />
        )}
      </aside>
    </div>
  );
}
