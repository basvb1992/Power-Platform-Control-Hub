/**
 * M365 Agents sub-tab — lists Microsoft 365 Copilot agents (built in the Agent
 * Builder) from Microsoft 365 via the Copilot Package Management custom connector
 * and shows their setup data (instructions, capabilities, knowledge, actions).
 */
import { useState } from "react";
import {
  listCopilotPackages,
  getCopilotPackageDetail,
  parseAgentSetup,
  isCopilotAgent,
  type CopilotPackage,
  type CopilotPackageDetail,
  type AgentSetup,
} from "../lib/m365Agents.ts";
import {
  evaluateSetup,
  type SetupState,
  type SetupStep,
  type StepStatus,
} from "../lib/m365Setup.ts";
import { shortDate } from "../lib/format.ts";

export function M365AgentsPanel({ instanceUrl, environmentId }: { instanceUrl?: string; environmentId?: string }) {
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<CopilotPackage[]>([]);
  const [setup, setSetup] = useState<SetupState | null>(null);

  const [open, setOpen] = useState<{ detail: CopilotPackageDetail; setup: AgentSetup } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const state = await evaluateSetup(instanceUrl, environmentId);
      setSetup(state);
      if (state.ready) {
        const list = await listCopilotPackages({ agentsOnly: true });
        setPackages(list.filter(isCopilotAgent));
      } else {
        setPackages([]);
      }
      setHasLoaded(true);
    } catch (e) {
      setPackages([]);
      setError((e as Error)?.message ?? "Failed to load M365 Copilot agents");
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(p: CopilotPackage) {
    setDetailLoading(true);
    setDetailError(null);
    setOpen(null);
    try {
      const detail = await getCopilotPackageDetail(p.id);
      setOpen({ detail, setup: parseAgentSetup(detail) });
    } catch (e) {
      setDetailError((e as Error)?.message ?? "Failed to load agent setup");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Microsoft 365 Copilot agents</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Agents built in the M365 Copilot Agent Builder store their setup in Microsoft 365 — read
            here via the Copilot Package Management custom connector (Graph, preview).
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" /> Checking…
            </>
          ) : hasLoaded ? (
            "Recheck"
          ) : (
            "Check setup"
          )}
        </button>
      </div>

      {error && (
        <div className="inbox-row sev-medium" style={{ marginTop: 12, display: "block" }}>
          <strong>Couldn't read M365 agents.</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{error}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            This needs the <code>m365copilotpackages</code> custom connector (a Microsoft Agent 365
            license + <code>CopilotPackages.Read.All</code> as AI/Global admin). See
            <code> connectors/m365-copilot-packages/README.md</code> for one-time setup.
          </div>
        </div>
      )}

      {!error && setup && !setup.ready && <SetupGuide setup={setup} />}

      {!error && setup?.ready && packages.length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>No Microsoft 365 Copilot agents found in this tenant.</p>
      )}

      {packages.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Type</th>
              <th>Publisher</th>
              <th>Hosts</th>
              <th>Version</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => openDetail(p)}>
                <td>
                  {p.displayName}
                  {p.isBlocked && <span className="pill fail" style={{ marginLeft: 8 }}>blocked</span>}
                </td>
                <td>{p.type ?? "—"}</td>
                <td>{p.publisher ?? "—"}</td>
                <td>{(p.supportedHosts ?? []).join(", ") || "—"}</td>
                <td>{p.version ?? "—"}</td>
                <td>{p.lastModifiedDateTime ? shortDate(p.lastModifiedDateTime) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detailLoading && (
        <p className="muted" style={{ marginTop: 12 }}>
          <span className="spinner" /> Loading agent setup…
        </p>
      )}
      {detailError && <p className="err" style={{ marginTop: 12 }}>{detailError}</p>}

      {open && (
        <AgentSetupDrawer detail={open.detail} setup={open.setup} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

const STATUS_META: Record<StepStatus, { icon: string; label: string; cls: string }> = {
  done: { icon: "✓", label: "Done", cls: "ok" },
  todo: { icon: "●", label: "To do", cls: "warn" },
  manual: { icon: "○", label: "Manual step", cls: "kind" },
  blocked: { icon: "—", label: "Blocked", cls: "muted" },
};

function SetupGuide({ setup }: { setup: SetupState }) {
  const done = setup.steps.filter((s) => s.status === "done").length;
  const pct = Math.round(setup.progress * 100);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="inbox-row sev-low" style={{ display: "block" }}>
        <strong>Set up the M365 Copilot connector</strong>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          These agents live in Microsoft 365, so the tab reads them through a custom connector. The
          steps below are checked live — finish the ones marked <em>to do</em> / <em>manual</em>.
          The client <strong>secret</strong> is entered on the connection only; never in an
          environment variable.
        </div>
        <div className="share" style={{ marginTop: 10, maxWidth: 360 }}>
          <div className="share-track">
            <div className="share-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="share-pct">
            {done}/{setup.steps.length} done
          </span>
        </div>
        {setup.probe.kind === "unknown" && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Connector response: {setup.probe.message}
          </div>
        )}
      </div>

      <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
        {setup.steps.map((step, i) => (
          <StepRow key={step.id} step={step} n={i + 1} />
        ))}
      </ol>
    </div>
  );
}

function StepRow({ step, n }: { step: SetupStep; n: number }) {
  const meta = STATUS_META[step.status];
  return (
    <li
      style={{
        display: "flex",
        gap: 12,
        padding: "10px 0",
        borderTop: n === 1 ? "none" : "1px solid var(--border, #e5e5e5)",
      }}
    >
      <div style={{ flex: "0 0 auto", fontVariantNumeric: "tabular-nums", opacity: 0.6 }}>{n}.</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 14 }}>{step.title}</strong>
          <span className={`pill ${meta.cls}`}>
            {meta.icon} {meta.label}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{step.detail}</div>
        {step.links && step.links.length > 0 && step.status !== "done" && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 12 }}>
            {step.links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                {l.label} ↗
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-head" style={{ marginBottom: 6 }}>
        <strong>{title}</strong>
        <span className="muted">{items.length}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 14 }}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function AgentSetupDrawer({
  detail,
  setup,
  onClose,
}: {
  detail: CopilotPackageDetail;
  setup: AgentSetup;
  onClose: () => void;
}) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Agent setup">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{setup.name ?? detail.displayName}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {detail.type ?? "agent"}
              {setup.version ? ` · v${setup.version}` : detail.version ? ` · v${detail.version}` : ""}
              {detail.publisher ? ` · ${detail.publisher}` : ""}
            </div>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {(setup.description ?? detail.shortDescription) && (
            <p style={{ fontSize: 14 }}>{setup.description ?? detail.shortDescription}</p>
          )}

          {setup.instructions && (
            <div style={{ marginTop: 14 }}>
              <strong>Instructions</strong>
              <pre className="codeblock" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                {setup.instructions}
              </pre>
            </div>
          )}

          <Section title="Conversation starters" items={setup.conversationStarters} />
          <Section title="Capabilities" items={setup.capabilities} />
          <Section title="Knowledge sources" items={setup.knowledge} />
          <Section title="Actions" items={setup.actions} />

          {setup.instructions === undefined &&
            setup.capabilities.length === 0 &&
            setup.actions.length === 0 &&
            setup.raw.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <strong>Raw definition</strong>
                {setup.raw.map((r, i) => (
                  <div key={i} style={{ marginTop: 8 }}>
                    <div className="muted" style={{ fontSize: 12 }}>{r.elementType}</div>
                    <pre className="codeblock" style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
                      {r.json}
                    </pre>
                  </div>
                ))}
              </div>
            )}
        </div>
      </aside>
    </div>
  );
}
