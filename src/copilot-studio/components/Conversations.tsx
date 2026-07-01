import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RunInfo, CostModel, StepInfo, ConversationMessage, ConvEvent } from "../lib/costEngine";
import { isFailedStep, runCredits, creditBreakdown } from "../lib/costEngine";
import { shortDate, money } from "../lib/format";

/* ------------------------------------------------------------------ helpers */

type Outcome = "completed" | "failures" | "abandoned";

function outcomeOf(r: RunInfo): Outcome {
  const failed = r.steps.filter(isFailedStep).length;
  if (failed > 0) return "failures";
  // abandoned heuristic: user spoke but the agent produced no dialogue turn back
  const userTurns = r.messages.filter((m) => m.role === "user").length;
  const botTurns = r.messages.filter((m) => m.role === "bot").length;
  if (userTurns > 0 && botTurns === 0) return "abandoned";
  return "completed";
}

const OUTCOME_META: Record<Outcome, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "ok" },
  failures: { label: "Has failures", cls: "fail" },
  abandoned: { label: "Abandoned", cls: "warn" },
};

/** Kind → css modifier for the trace dots / chips. */
function kindClass(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("connected")) return "k-agent";
  if (k.includes("knowledge")) return "k-knowledge";
  if (k.includes("action")) return "k-action";
  return "k-other";
}

/** Count steps that invoke a connected (child) agent. */
function connectedAgentSteps(r: RunInfo): number {
  return r.steps.filter((s) => kindClass(s.kind) === "k-agent").length;
}

/** Order a conversation's runs: orchestrator (most connected-agent calls) first. */
function orderFanOut(runs: RunInfo[]): RunInfo[] {
  return [...runs].sort((a, b) => {
    const ca = connectedAgentSteps(b) - connectedAgentSteps(a);
    if (ca !== 0) return ca;
    return String(a.createdon).localeCompare(String(b.createdon));
  });
}

function durationLabel(messages: ConversationMessage[]): string | null {
  const ts = messages.map((m) => m.timestamp).filter(Boolean).sort();
  if (ts.length < 2) return null;
  const a = new Date(ts[0]).getTime();
  const b = new Date(ts[ts.length - 1]).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ------------------------------------------------------------- visualizers */

function ReplayView({ messages }: { messages: ConversationMessage[] }) {
  if (!messages.length)
    return <p className="chat-empty">No dialogue turns were captured in this conversation.</p>;
  return (
    <div className="chat">
      {messages.map((m, i) => (
        <div className={`bubble ${m.role}`} key={i}>
          <div className="who">{m.role === "user" ? "User" : "Agent"}</div>
          <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
        </div>
      ))}
    </div>
  );
}

function TraceStep({ s, idx, model }: { s: StepInfo; idx: number; model: CostModel }) {
  const [open, setOpen] = useState(false);
  const fail = isFailedStep(s);
  const kc = kindClass(s.kind);
  const hasDetail = s.thought.length > 0;
  return (
    <div className="trace-card">
      <button
        className={`trace-head ${hasDetail ? "clickable" : ""}`}
        onClick={() => hasDetail && setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="trace-num">{idx + 1}</span>
        <span className={`pill kind ${kc}`}>{s.kind}</span>
        <span className={`pill ${fail ? "fail" : "ok"}`}>
          {fail ? "failed · 0 cr" : model.pricePerCredit > 0 ? `${s.cost} cr · ${money(s.cost, model)}` : `${s.cost} cr`}
        </span>
        <code className="trace-tool">{s.tool || "(step)"}</code>
        {hasDetail && <span className="trace-caret">{open ? "−" : "+"} details</span>}
      </button>
      {!fail && s.cost > 0 && (
        <div className="trace-buildup">
          {creditBreakdown(s.cost).map((b) => (
            <span className="pill cost" key={b.label}>{b.label} {b.cr}</span>
          ))}
          <span className="buildup-eq">= {s.cost} cr</span>
        </div>
      )}
      {open && s.thought && <div className="trace-thought">{s.thought}</div>}
    </div>
  );
}

function CostRollup({ steps, model }: { steps: StepInfo[]; model: CostModel }) {
  if (!steps.length) return null;
  const billable = steps.filter((s) => !isFailedStep(s));
  const credits = billable.reduce((sum, s) => sum + s.cost, 0);
  const byMeter = new Map<string, number>();
  for (const s of billable) for (const b of creditBreakdown(s.cost)) byMeter.set(b.label, (byMeter.get(b.label) ?? 0) + b.cr);
  const failed = steps.length - billable.length;
  return (
    <div className="rollup">
      <span className="rollup-total">{billable.length} billable · <strong>{credits} cr</strong>{model.pricePerCredit > 0 ? ` · ${money(credits, model)}` : ""}</span>
      <span className="rollup-kinds">
        {[...byMeter.entries()].map(([k, cr]) => (
          <span className="pill kind" key={k}>{k}: {cr} cr</span>
        ))}
        {failed > 0 && <span className="pill fail">{failed} failed · 0 cr</span>}
      </span>
    </div>
  );
}

function OrchestrationTrace({ steps, model }: { steps: StepInfo[]; model: CostModel }) {
  if (!steps.length) return <p className="chat-empty">No orchestration steps in this conversation.</p>;
  return (
    <div className="trace">
      {steps.map((s, i) => (
        <div className="trace-step" key={i}>
          <div className="trace-rail">
            <span className={`trace-dot ${kindClass(s.kind)} ${isFailedStep(s) ? "failed" : ""}`} />
            {i < steps.length - 1 && <span className="trace-line" />}
          </div>
          <TraceStep s={s} idx={i} model={model} />
        </div>
      ))}
      <CostRollup steps={steps} model={model} />
    </div>
  );
}

/** Interleaved transcript: bubbles + steps in chronological order. */
function MergedTimeline({ events, model }: { events: ConvEvent[]; model: CostModel }) {
  if (!events.length) return <p className="chat-empty">No activity captured.</p>;
  let stepNo = 0;
  return (
    <div className="trace">
      {events.map((e, i) =>
        e.kind === "message" ? (
          <div className={`bubble ${e.message.role}`} key={i}>
            <div className="who">{e.message.role === "user" ? "User" : "Agent"}</div>
            <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{e.message.text}</ReactMarkdown></div>
          </div>
        ) : (
          <div className="trace-step" key={i}>
            <div className="trace-rail">
              <span className={`trace-dot ${kindClass(e.step.kind)} ${isFailedStep(e.step) ? "failed" : ""}`} />
            </div>
            <TraceStep s={e.step} idx={stepNo++} model={model} />
          </div>
        )
      )}
      <CostRollup steps={events.filter((e) => e.kind === "step").map((e) => (e as { step: StepInfo }).step)} model={model} />
    </div>
  );
}

/** Full conversation across every connected agent: orchestrator first, children stacked & indented. */
function FullConversationViewer({
  run,
  siblings,
  model,
  onClose,
}: {
  run: RunInfo;
  siblings: RunInfo[];
  model: CostModel;
  onClose: () => void;
}) {
  const fanOut = orderFanOut(siblings);
  const totalCredits = fanOut.reduce((s, r) => s + runCredits(r, model.creditPerStep), 0);
  const totalSteps = fanOut.reduce((s, r) => s + r.steps.length, 0);
  const [layout, setLayout] = useState<"stacked" | "swimlanes">("stacked");
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="full-viewer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Full conversation">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">Full conversation</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {shortDate(run.createdon)} · {fanOut.length} agent{fanOut.length > 1 ? "s" : ""} · {totalSteps} steps · {totalCredits} cr
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {fanOut.length > 1 && (
              <div className="seg">
                <button className={layout === "stacked" ? "on" : ""} onClick={() => setLayout("stacked")}>Stacked</button>
                <button className={layout === "swimlanes" ? "on" : ""} onClick={() => setLayout("swimlanes")}>Swimlanes</button>
              </div>
            )}
            <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className={layout === "swimlanes" ? "fc-lanes" : "fc-body"}>
          {fanOut.map((r, i) => {
            const isRoot = i === 0;
            return (
              <section className={`fc-agent ${isRoot ? "root" : "child"}`} key={r.id}>
                <header className="fc-agent-head">
                  <span className="fanout-branch" aria-hidden>{isRoot ? "◆" : "└─"}</span>
                  <span className="fc-agent-name">{r.agentLabel}</span>
                  {isRoot && <span className="pill kind k-agent">orchestrator</span>}
                  <span className="fanout-cr">{runCredits(r, model.creditPerStep)} cr</span>
                </header>
                {r.events.length > 0 ? (
                  <MergedTimeline events={r.events} model={model} />
                ) : (
                  <>
                    {r.messages.length > 0 && <ReplayView messages={r.messages} />}
                    <OrchestrationTrace steps={r.steps} model={model} />
                  </>
                )}
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ drawer */

// eslint-disable-next-line react-refresh/only-export-components
export function groupRuns(runs: RunInfo[]): Map<string, RunInfo[]> {
  const m = new Map<string, RunInfo[]>();
  for (const r of runs) {
    const arr = m.get(r.conversationId);
    if (arr) arr.push(r);
    else m.set(r.conversationId, [r]);
  }
  return m;
}

export function ConversationDrawer({
  run,
  siblings,
  model,
  onSelect,
  onClose,
}: {
  run: RunInfo;
  siblings: RunInfo[];
  model: CostModel;
  onSelect: (r: RunInfo) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"replay" | "trace">(run.messages.length ? "replay" : "trace");
  const [showFull, setShowFull] = useState(false);
  const completed = run.steps.filter((s) => !isFailedStep(s)).length;
  const failed = run.steps.length - completed;
  const credits = runCredits(run, model.creditPerStep);
  const duration = durationLabel(run.messages);
  const oc = OUTCOME_META[outcomeOf(run)];
  const fanOut = orderFanOut(siblings);
  const groupCredits = siblings.reduce((s, r) => s + runCredits(r, model.creditPerStep), 0);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Conversation detail">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{run.agentLabel}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {shortDate(run.createdon)} · conversation {run.conversationId.slice(0, 8)}…
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="linkbtn" onClick={() => setShowFull(true)}>⤢ Full conversation</button>
            <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {fanOut.length > 1 && (
          <div className="fanout">
            <div className="fanout-head">
              Connected agents in this conversation ({fanOut.length}) · {groupCredits} cr total
            </div>
            <div className="fanout-tree">
              {fanOut.map((r, i) => {
                const isRoot = i === 0;
                const cur = r.id === run.id;
                const rf = r.steps.filter(isFailedStep).length;
                return (
                  <button
                    key={r.id}
                    className={`fanout-node ${isRoot ? "root" : "child"} ${cur ? "current" : ""}`}
                    onClick={() => onSelect(r)}
                  >
                    <span className="fanout-branch" aria-hidden>
                      {isRoot ? "◆" : "└─"}
                    </span>
                    <span className="fanout-label">{r.agentLabel}</span>
                    <span className="fanout-meta">
                      {isRoot && <span className="pill kind k-agent">orchestrator</span>}
                      {rf > 0 && <span className="pill fail">{rf} failed</span>}
                      <span className="fanout-cr">{runCredits(r, model.creditPerStep)} cr</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="drawer-stats">
          <div className="dstat">
            <div className="v">{run.messages.length}</div>
            <div className="l">Turns</div>
          </div>
          <div className="dstat">
            <div className="v">{run.steps.length}</div>
            <div className="l">Steps</div>
          </div>
          <div className="dstat">
            <div className="v">{failed}</div>
            <div className="l">Failed</div>
          </div>
          <div className="dstat">
            <div className="v">{credits}</div>
            <div className="l">Credits</div>
          </div>
          {duration && (
            <div className="dstat">
              <div className="v">{duration}</div>
              <div className="l">Duration</div>
            </div>
          )}
          <div className="dstat">
            <div className="v">
              <span className={`pill ${oc.cls}`}>{oc.label}</span>
            </div>
            <div className="l">Outcome</div>
          </div>
        </div>

        <div className="seg" style={{ margin: "4px 0 16px" }}>
          <button className={view === "replay" ? "on" : ""} onClick={() => setView("replay")}>
            Conversation replay ({run.messages.length})
          </button>
          <button className={view === "trace" ? "on" : ""} onClick={() => setView("trace")}>
            Orchestration trace ({run.steps.length})
          </button>
        </div>

        <div className="drawer-body">
          {view === "replay" ? (
            <ReplayView messages={run.messages} />
          ) : (
            <OrchestrationTrace steps={run.steps} model={model} />
          )}
        </div>
        {showFull && (
          <FullConversationViewer run={run} siblings={fanOut} model={model} onClose={() => setShowFull(false)} />
        )}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export function ConversationsPage({ runs, model }: { runs: RunInfo[]; model: CostModel }) {
  const [search, setSearch] = useState("");
  const [agent, setAgent] = useState("");
  const [sort, setSort] = useState<"date" | "credits">("date");
  const [selected, setSelected] = useState<RunInfo | null>(null);

  const agents = useMemo(
    () => Array.from(new Set(runs.map((r) => r.agentLabel))).sort(),
    [runs]
  );

  const groups = useMemo(() => groupRuns(runs), [runs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = runs.filter((r) => {
      if (agent && r.agentLabel !== agent) return false;
      if (!q) return true;
      return (
        r.agentLabel.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    });
    list = [...list].sort((a, b) =>
      sort === "credits"
        ? runCredits(b, model.creditPerStep) - runCredits(a, model.creditPerStep)
        : String(b.createdon).localeCompare(String(a.createdon))
    );
    return list;
  }, [runs, search, agent, sort, model.creditPerStep]);

  if (!runs.length)
    return (
      <div className="card">
        <p className="muted">
          No conversations loaded yet. Pick a date range above and select{" "}
          <strong>Fetch &amp; calculate</strong> to pull transcripts.
        </p>
      </div>
    );

  return (
    <div className="card">
      <div className="flex-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>
          Conversations{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            ({rows.length} of {runs.length})
          </span>
        </h2>
        <div className="conv-tools">
          <input
            className="conv-search"
            placeholder="Search agent, id or message text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="seg">
            <button className={sort === "date" ? "on" : ""} onClick={() => setSort("date")}>
              Newest
            </button>
            <button className={sort === "credits" ? "on" : ""} onClick={() => setSort("credits")}>
              Most expensive
            </button>
          </div>
        </div>
      </div>

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Created</th>
            <th>Agent</th>
            <th className="num">Turns</th>
            <th className="num">Steps</th>
            <th className="num">Failed</th>
            <th className="num">Credits</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const failed = r.steps.filter(isFailedStep).length;
            const oc = OUTCOME_META[outcomeOf(r)];
            const groupSize = groups.get(r.conversationId)?.length ?? 1;
            return (
              <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                <td>{shortDate(r.createdon)}</td>
                <td>
                  {r.agentLabel}
                  {groupSize > 1 && (
                    <span className="pill kind k-agent" style={{ marginLeft: 8 }}>
                      +{groupSize - 1} connected
                    </span>
                  )}
                </td>
                <td className="num">{r.messages.length}</td>
                <td className="num">{r.steps.length}</td>
                <td className="num">{failed}</td>
                <td className="num">
                  <strong>{runCredits(r, model.creditPerStep)}</strong>
                </td>
                <td>
                  <span className={`pill ${oc.cls}`}>{oc.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected && (
        <ConversationDrawer
          key={selected.id}
          run={selected}
          siblings={groups.get(selected.conversationId) ?? [selected]}
          model={model}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
