import { useState } from "react";
import type {
  RunInfo,
  AgentRollup,
  CostModel,
  Totals,
  TrendPoint,
  KindRollup,
  OwnerRollup,
  Distribution,
  ConversationMessage,
} from "../lib/costEngine";
import { isFailedStep, runCredits } from "../lib/costEngine";
import { shortDate, money } from "../lib/format";
import { useSort, sortBy } from "../lib/tableSort";
import { SortTh } from "./SortHeader";

export function SummaryCards({ t, model }: { t: Totals; model: CostModel }) {
  return (
    <div className="card">
      <h2>Summary</h2>
      <div className="stats">
        <div className="stat">
          <div className="v">{t.transcripts}</div>
          <div className="l">Transcripts</div>
        </div>
        <div className="stat">
          <div className="v">{t.completed}</div>
          <div className="l">Completed steps</div>
        </div>
        <div className="stat">
          <div className="v">{t.failed}</div>
          <div className="l">Failed steps (0 cr)</div>
        </div>
        <div className="stat">
          <div className="v">{t.credits}</div>
          <div className="l">Metered credits</div>
        </div>
        <div className="stat">
          <div className="v">{money(t.credits, model)}</div>
          <div className="l">Metered cost</div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Every figure is the sum of each transcript's per-message <code>displayedCost</code> — the exact credits
        Microsoft metered, never a flat per-step assumption.
      </p>
      <div className="credit-legend">
        <strong>How credits are billed</strong> (Microsoft Copilot Studio rates):
        <span className="pill kind">Classic answer 1</span>
        <span className="pill kind">Generative answer 2</span>
        <span className="pill kind">Agent action 5</span>
        <span className="pill kind">Tenant graph grounding 10</span>
        <span className="pill kind">Agent flow 13/100</span>
        <p className="hint" style={{ marginTop: 8 }}>
          A typical step = <strong>7 cr</strong> (agent action 5 + generative 2). Failed steps cost 0.
          <strong> Deep reasoning</strong> adds <em>Text &amp; generative AI tools (premium)</em> at 10 cr / 1,000 tokens —
          these token credits are billed by the model and are <em>not</em> recorded in transcripts, so an agent using a
          deep reasoning model costs more than shown here. For reasoning-tier agents the table shows a
          <strong> +≈ est. premium</strong> figure — a heuristic estimate from the volume of reasoning + answer text
          (~4 chars/token), not billed actuals. Reconcile in <strong>PPAC → Licensing → Copilot Studio</strong>.
        </p>
      </div>
    </div>
  );
}

export function ByAgentTable({ rows, onSelect }: { rows: AgentRollup[]; onSelect?: (key: string) => void }) {
  const { sort, onSort } = useSort<
    "agent" | "model" | "transcripts" | "completed" | "failed" | "credits"
  >("credits", "desc");
  if (!rows.length) return null;
  const totalCredits = rows.reduce((a, r) => a + r.credits, 0) || 1;
  const maxCredits = Math.max(...rows.map((r) => r.credits), 1);
  const topKey = rows.reduce((best, r) => (r.credits > best.credits ? r : best), rows[0]).key;
  const sorted = sortBy(rows, sort, (r, k) =>
    k === "agent"
      ? r.label
      : k === "model"
        ? r.modelLabel
        : k === "transcripts"
          ? r.transcripts
          : k === "completed"
            ? r.completed
            : k === "failed"
              ? r.failed
              : r.credits
  );
  return (
    <div className="card">
      <h2>By agent</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Click a column header to sort.{onSelect ? " Select a row to open the agent." : ""}
      </p>
      <table>
        <thead>
          <tr>
            <SortTh col="agent" label="Agent" sort={sort} onSort={onSort} />
            <SortTh col="model" label="Model" sort={sort} onSort={onSort} />
            <SortTh col="transcripts" label="Transcripts" sort={sort} onSort={onSort} numeric />
            <SortTh col="completed" label="Completed" sort={sort} onSort={onSort} numeric />
            <SortTh col="failed" label="Failed" sort={sort} onSort={onSort} numeric />
            <SortTh col="credits" label="Credits" sort={sort} onSort={onSort} numeric />
            <th>Share of total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const pct = Math.round((a.credits / totalCredits) * 100);
            const isTop = a.key === topKey && a.credits > 0;
            return (
              <tr
                key={a.key}
                className={`${isTop ? "top-spender" : ""} ${onSelect ? "clickable" : ""}`}
                onClick={onSelect ? () => onSelect(a.key) : undefined}
              >
                <td>
                  {a.label}
                  {isTop && (
                    <span className="pill warn" style={{ marginLeft: 8 }}>
                      top spender
                    </span>
                  )}
                  {a.deepReasoning && (
                    <span
                      className="pill warn"
                      style={{ marginLeft: 8 }}
                      title="This agent is configured to use a deep-reasoning / premium model. Premium token costs (10 cr / 1,000 tokens) are billed on a separate meter and are NOT included in the metered credits shown here — see the estimate next to the credits."
                    >
                      🧠 deep reasoning
                    </span>
                  )}
                </td>
                <td>
                  {a.modelLabel ? (
                    <span
                      className={`pill ${a.modelTier === "premium" ? "warn" : "kind"}`}
                      title={`Configured model: ${a.model || a.modelLabel} (${a.modelTier} tier)`}
                    >
                      {a.modelLabel}
                    </span>
                  ) : (
                    <span className="hint">—</span>
                  )}
                </td>
                <td className="num">{a.transcripts}</td>
                <td className="num">{a.completed}</td>
                <td className="num">{a.failed}</td>
                <td className="num">
                  <strong>{a.credits}</strong>
                  {a.deepReasoning && a.estPremiumCredits > 0 && (
                    <div
                      className="hint"
                      style={{ marginTop: 2, whiteSpace: "nowrap" }}
                      title={`Heuristic estimate only. Premium reasoning tokens (≈${a.estPremiumTokens.toLocaleString()} tokens) are billed at 10 credits / 1,000 tokens on a separate meter that is NOT recorded in transcripts. This figure is approximated from the volume of reasoning + answer text (~4 chars/token) and is on top of the ${a.credits} metered credits. Reconcile actuals in PPAC → Licensing → Copilot Studio.`}
                    >
                      +≈{a.estPremiumCredits} est. premium
                    </div>
                  )}
                </td>
                <td>
                  <div className="share">
                    <div className="share-track">
                      <div
                        className="share-fill"
                        style={{ width: `${Math.round((a.credits / maxCredits) * 100)}%` }}
                      />
                    </div>
                    <span className="share-pct">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConversationView({ messages }: { messages: ConversationMessage[] }) {
  if (!messages.length)
    return <p className="chat-empty">No dialogue turns were captured in this transcript.</p>;
  return (
    <div className="chat">
      {messages.map((m, i) => (
        <div className={`bubble ${m.role}`} key={i}>
          <div className="who">{m.role === "user" ? "User" : "Agent"}</div>
          {m.text}
        </div>
      ))}
    </div>
  );
}

function StepsView({ r }: { r: RunInfo }) {
  return (
    <>
      {r.steps.map((s, i) => {
        const fail = isFailedStep(s);
        return (
          <div className="stepline" key={i}>
            <span className="pill kind">{s.kind}</span>
            <span className={`pill ${fail ? "fail" : "ok"}`}>
              {fail ? "failed · 0" : `ok · ${s.cost}`}
            </span>
            <code style={{ fontSize: "0.78rem" }}>{s.tool || "(step)"}</code>
            {s.thought && (
              <div className="thought">
                {s.thought.slice(0, 160)}
                {s.thought.length > 160 ? "…" : ""}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function TranscriptRow({ r }: { r: RunInfo }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"conv" | "steps">(r.messages.length ? "conv" : "steps");
  const completed = r.steps.filter((s) => !isFailedStep(s)).length;
  const failed = r.steps.length - completed;
  const credits = runCredits(r);
  return (
    <>
      <tr className="run-row" onClick={() => setOpen((o) => !o)}>
        <td>{open ? "▾" : "▸"} {shortDate(r.createdon)}</td>
        <td>{r.agentLabel}</td>
        <td className="num">{r.messages.length}</td>
        <td className="num">{completed}</td>
        <td className="num">{failed}</td>
        <td className="num">
          <strong>{credits}</strong>
        </td>
        <td className="muted">{r.id.slice(0, 8)}…</td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={7}>
            <div className="inner">
              <div className="seg" style={{ marginBottom: 12 }}>
                <button
                  className={view === "conv" ? "on" : ""}
                  onClick={() => setView("conv")}
                >
                  Conversation ({r.messages.length})
                </button>
                <button
                  className={view === "steps" ? "on" : ""}
                  onClick={() => setView("steps")}
                >
                  Cost steps ({r.steps.length})
                </button>
              </div>
              {view === "conv" ? (
                <ConversationView messages={r.messages} />
              ) : (
                <StepsView r={r} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function TranscriptTable({ runs }: { runs: RunInfo[] }) {
  const [sort, setSort] = useState<"date" | "credits">("date");
  if (!runs.length) return null;
  const sorted = [...runs].sort((a, b) =>
    sort === "credits"
      ? runCredits(b) - runCredits(a)
      : String(b.createdon).localeCompare(String(a.createdon))
  );
  return (
    <div className="card">
      <div className="flex-between" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>
          Conversations{" "}
          <span className="muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            (click a row to read the dialogue or inspect cost steps)
          </span>
        </h2>
        <div className="seg">
          <button className={sort === "date" ? "on" : ""} onClick={() => setSort("date")}>
            Newest
          </button>
          <button className={sort === "credits" ? "on" : ""} onClick={() => setSort("credits")}>
            Most expensive
          </button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Agent</th>
            <th className="num">Turns</th>
            <th className="num">Steps</th>
            <th className="num">Failed</th>
            <th className="num">Credits</th>
            <th>Id</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <TranscriptRow key={r.id} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnomalyPanel({ runs }: { runs: RunInfo[] }) {
  const withFailures = runs
    .map((r) => ({
      r,
      failed: r.steps.filter((s) => isFailedStep(s)).length,
    }))
    .filter((x) => x.failed > 0)
    .sort((a, b) => b.failed - a.failed);

  const topSpenders = [...runs]
    .map((r) => ({ r, credits: runCredits(r) }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, 5);

  if (!runs.length) return null;
  return (
    <div className="card">
      <h2>Waste &amp; anomalies</h2>
      {withFailures.length === 0 ? (
        <p className="muted">No failed steps detected in this window. 🎉</p>
      ) : (
        <>
          <p className="hint">
            <strong>{withFailures.length}</strong> transcript(s) contain failed steps — these
            consumed reasoning effort but produced no billable result.
          </p>
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Agent</th>
                <th className="num">Failed steps</th>
              </tr>
            </thead>
            <tbody>
              {withFailures.slice(0, 8).map((x) => (
                <tr key={x.r.id}>
                  <td>{shortDate(x.r.createdon)}</td>
                  <td>{x.r.agentLabel}</td>
                  <td className="num">
                    <span className="pill warn">{x.failed}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2 style={{ marginTop: 20 }}>Top cost transcripts</h2>
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Agent</th>
            <th className="num">Credits</th>
          </tr>
        </thead>
        <tbody>
          {topSpenders.map((x) => (
            <tr key={x.r.id}>
              <td>{shortDate(x.r.createdon)}</td>
              <td>{x.r.agentLabel}</td>
              <td className="num">
                <strong>{x.credits}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrendChart({ points, model }: { points: TrendPoint[]; model: CostModel }) {
  if (points.length < 2) return null;
  const maxCredits = Math.max(...points.map((p) => p.credits), 1);
  return (
    <div className="card">
      <h2>Credits over time</h2>
      <div className="trend">
        {points.map((p) => (
          <div className="trend-col" key={p.date} title={`${p.date}: ${p.credits} credits, ${p.transcripts} transcripts`}>
            <div className="trend-val">{p.credits}</div>
            <div
              className="trend-bar"
              style={{ height: `${Math.round((p.credits / maxCredits) * 100)}%` }}
            />
            <div className="trend-label">{p.date.slice(5)}</div>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Daily credits across the loaded window{model.pricePerCredit > 0 ? " — hover for detail" : ""}.
      </p>
    </div>
  );
}

export function ByKindCard({ rows, model }: { rows: KindRollup[]; model: CostModel }) {
  const { sort, onSort } = useSort<"kind" | "completed" | "failed" | "credits">("credits", "desc");
  if (!rows.length) return null;
  const total = rows.reduce((a, k) => a + k.credits, 0) || 1;
  const sorted = sortBy(rows, sort, (r, k) =>
    k === "kind" ? r.kind : k === "completed" ? r.completed : k === "failed" ? r.failed : r.credits
  );
  return (
    <div className="card">
      <h2>Where the credits go</h2>
      <table>
        <thead>
          <tr>
            <SortTh col="kind" label="Capability" sort={sort} onSort={onSort} />
            <SortTh col="completed" label="Completed" sort={sort} onSort={onSort} numeric />
            <SortTh col="failed" label="Failed" sort={sort} onSort={onSort} numeric />
            <SortTh col="credits" label="Credits" sort={sort} onSort={onSort} numeric />
            <th className="num">Share</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((k) => (
            <tr key={k.kind}>
              <td>
                <span className="pill kind">{k.kind}</span>
              </td>
              <td className="num">{k.completed}</td>
              <td className="num">{k.failed}</td>
              <td className="num">
                <strong>{k.credits}</strong>
              </td>
              <td className="num">{Math.round((k.credits / total) * 100)}%</td>
              <td>{money(k.credits, model)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ByOwnerCard({ rows, model }: { rows: OwnerRollup[]; model: CostModel }) {
  const { sort, onSort } = useSort<"owner" | "transcripts" | "credits">("credits", "desc");
  if (rows.length < 2) return null; // only interesting with >1 owner
  const sorted = sortBy(rows, sort, (r, k) =>
    k === "owner" ? r.owner : k === "transcripts" ? r.transcripts : r.credits
  );
  return (
    <div className="card">
      <h2>By owner</h2>
      <table>
        <thead>
          <tr>
            <SortTh col="owner" label="Owner" sort={sort} onSort={onSort} />
            <SortTh col="transcripts" label="Transcripts" sort={sort} onSort={onSort} numeric />
            <SortTh col="credits" label="Credits" sort={sort} onSort={onSort} numeric />
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.owner}>
              <td>{o.owner}</td>
              <td className="num">{o.transcripts}</td>
              <td className="num">
                <strong>{o.credits}</strong>
              </td>
              <td>{money(o.credits, model)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DistributionCard({ d }: { d: Distribution }) {
  if (!d.count) return null;
  return (
    <div className="card">
      <h2>Per-transcript spread</h2>
      <div className="stats">
        <div className="stat">
          <div className="v">{d.min}</div>
          <div className="l">Min credits</div>
        </div>
        <div className="stat">
          <div className="v">{d.p50}</div>
          <div className="l">Median (p50)</div>
        </div>
        <div className="stat">
          <div className="v">{d.p90}</div>
          <div className="l">p90</div>
        </div>
        <div className="stat">
          <div className="v">{d.max}</div>
          <div className="l">Max</div>
        </div>
        <div className="stat">
          <div className="v">{d.mean}</div>
          <div className="l">Mean</div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        A large gap between p90 and max points to a few expensive outlier conversations.
      </p>
    </div>
  );
}

export function BudgetCard({
  budget,
  setBudget,
  usedCredits,
  model,
}: {
  budget: number;
  setBudget: (n: number) => void;
  usedCredits: number;
  model: CostModel;
}) {
  const pct = budget > 0 ? Math.round((usedCredits / budget) * 100) : 0;
  const level = pct >= 100 ? "fail" : pct >= 80 ? "warn" : "ok";
  return (
    <div className="card">
      <h2>Budget</h2>
      <div className="grid">
        <div>
          <label>Credit budget for this window</label>
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
          />
          <p className="hint">Set your PPAC capacity / prepaid allotment to track headroom.</p>
        </div>
        <div>
          <label>Consumed</label>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cp-text)" }}>
            {usedCredits} {budget > 0 && <span className="muted" style={{ fontSize: "0.9rem" }}>/ {budget}</span>}
          </div>
          {budget > 0 && (
            <>
              <div className="bar" style={{ marginTop: 8 }}>
                <span
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background:
                      level === "fail"
                        ? "var(--cp-danger)"
                        : level === "warn"
                        ? "var(--cp-warning)"
                        : "var(--cp-success)",
                  }}
                />
              </div>
              <p style={{ marginTop: 6 }}>
                <span className={`pill ${level}`}>{pct}% used</span>{" "}
                {model.pricePerCredit > 0 && (
                  <span className="muted">({money(usedCredits, model)} of {money(budget, model)})</span>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
