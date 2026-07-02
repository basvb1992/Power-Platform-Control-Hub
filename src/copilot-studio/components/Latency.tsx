/**
 * Latency tab — per-turn timing and bottleneck inspector for orchestrated agents.
 *
 * Reads the timing profile the cost engine attaches to each RunInfo (see
 * lib/latency.ts) and surfaces: fleet KPIs, a per-agent timing rollup, and a
 * per-run drill-down with a step waterfall, a per-step timing table and
 * heuristic improvement suggestions.
 *
 * Timing heuristics adapted (MIT) from Roel Schenk's mcs-agent-analyser
 * (https://github.com/Roelzz/mcs-agent-analyser), re-implemented natively.
 */
import { useMemo, useState } from "react";
import type { RunInfo } from "../lib/costEngine";
import type { LatencyProfile, LatencyStep, LatencySuggestion } from "../lib/latency";
import {
  fmtMs,
  latencyByAgent,
  latencyFleetSummary,
  timedRuns,
  SLOW_STEP_MS,
  SLOW_TURN_MS,
} from "../lib/latency";
import { shortDate } from "../lib/format";
import { useSort, sortBy } from "../lib/tableSort";
import { SortTh } from "./SortHeader";

/** Kind → css modifier (mirrors the Conversations trace colours). */
function kindClass(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("connected")) return "k-agent";
  if (k.includes("knowledge")) return "k-knowledge";
  if (k.includes("action")) return "k-action";
  return "k-other";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/* -------------------------------------------------------------- visualizers */

function BucketBar({ profile }: { profile: LatencyProfile }) {
  const total = profile.buckets.reduce((a, b) => a + b.ms, 0);
  if (total <= 0) return null;
  return (
    <div className="lat-buckets" title="How the turn's wall-clock time splits">
      <div className="lat-bucket-bar">
        {profile.buckets.map((b) => (
          <span
            key={b.label}
            className={`lat-seg ${b.cls}`}
            style={{ width: `${(b.ms / total) * 100}%` }}
            title={`${b.label}: ${fmtMs(b.ms)}`}
          />
        ))}
      </div>
      <div className="lat-legend">
        {profile.buckets.map((b) => (
          <span key={b.label} className="lat-legend-item">
            <span className={`lat-dot ${b.cls}`} /> {b.label} · {fmtMs(b.ms)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Waterfall({ profile }: { profile: LatencyProfile }) {
  const steps = profile.steps;
  if (!steps.length || !(profile.totalMs > 0)) return null;
  const origin = steps[0].startMs - steps[0].gapBeforeMs;
  const span = profile.totalMs;
  return (
    <div className="lat-waterfall">
      {steps.map((s) => {
        const left = clamp(((s.startMs - origin) / span) * 100);
        const width = Math.max(0.8, clamp((s.waitMs / span) * 100));
        const execFrac = s.waitMs > 0 ? Math.min(1, s.execMs / s.waitMs) : 1;
        const slow = s.waitMs >= SLOW_STEP_MS || s.index === profile.slowestStepIndex;
        return (
          <div className="lat-wf-row" key={s.index}>
            <span className="lat-wf-label" title={s.tool || s.toolLabel}>
              {s.index + 1}. {s.toolLabel}
            </span>
            <div className="lat-track">
              <div
                className={`lat-bar ${kindClass(s.kind)} ${s.failed ? "failed" : ""} ${slow ? "slow" : ""}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${s.toolLabel} — wait ${fmtMs(s.waitMs)} (exec ${fmtMs(s.execMs)}, overhead ${fmtMs(
                  s.overheadMs
                )})`}
              >
                <span className="lat-bar-exec" style={{ width: `${execFrac * 100}%` }} />
              </div>
            </div>
            <span className="lat-wf-time num">{fmtMs(s.waitMs)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StepTable({ profile }: { profile: LatencyProfile }) {
  const span = profile.totalMs || 1;
  return (
    <table className="subtable lat-steptable">
      <thead>
        <tr>
          <th>#</th>
          <th>Tool</th>
          <th>Kind</th>
          <th className="num">Wait</th>
          <th className="num">Exec</th>
          <th className="num">Overhead</th>
          <th className="num">Gap before</th>
          <th className="num">% turn</th>
          <th className="num">Cost</th>
        </tr>
      </thead>
      <tbody>
        {profile.steps.map((s) => {
          const slow = s.waitMs >= SLOW_STEP_MS || s.index === profile.slowestStepIndex;
          return (
            <tr key={s.index} className={slow ? "lat-slow-row" : ""}>
              <td className="num">{s.index + 1}</td>
              <td>
                <code className="lat-toolcode" title={s.tool}>
                  {s.toolLabel}
                </code>
              </td>
              <td>
                <span className={`pill kind ${kindClass(s.kind)}`}>{s.kind}</span>
              </td>
              <td className="num">
                {slow && <span title="Slowest / over threshold">🔴 </span>}
                {fmtMs(s.waitMs)}
              </td>
              <td className="num">{fmtMs(s.execMs)}</td>
              <td className="num">{fmtMs(s.overheadMs)}</td>
              <td className="num">{s.gapBeforeMs > 0 ? fmtMs(s.gapBeforeMs) : "—"}</td>
              <td className="num">{pct(s.waitMs / span)}</td>
              <td className="num">{s.failed ? "0" : s.cost}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const SEV_META: Record<LatencySuggestion["severity"], { label: string; cls: string }> = {
  high: { label: "High", cls: "fail" },
  med: { label: "Medium", cls: "warn" },
  low: { label: "Low", cls: "ok" },
};

function Suggestions({
  items,
  onOpenFlows,
}: {
  items: LatencySuggestion[];
  onOpenFlows?: () => void;
}) {
  if (!items.length)
    return <p className="muted">No obvious latency bottlenecks — this turn is within healthy limits.</p>;
  return (
    <ul className="lat-suggestions">
      {items.map((s, i) => {
        const meta = SEV_META[s.severity];
        const isTool = /\.action\./i.test(s.tool || "");
        return (
          <li key={i}>
            <div className="lat-sug-head">
              <span className={`pill ${meta.cls}`}>{meta.label}</span>
              <strong>{s.title}</strong>
            </div>
            <p className="lat-sug-detail">{s.detail}</p>
            {isTool && onOpenFlows && (
              <button className="linkbtn" onClick={onOpenFlows}>
                Inspect agent flows →
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- run detail */

function RunDetail({ run, onOpenFlows }: { run: RunInfo; onOpenFlows?: () => void }) {
  const p = run.latency!;
  const slowest: LatencyStep | undefined =
    p.slowestStepIndex >= 0 ? p.steps[p.slowestStepIndex] : undefined;
  return (
    <div className="lat-detail">
      <div className="lat-detail-stats">
        <div className="dstat">
          <div className="v">{fmtMs(p.totalMs)}</div>
          <div className="l">Turn time</div>
        </div>
        <div className="dstat">
          <div className="v">{p.steps.length}</div>
          <div className="l">Steps</div>
        </div>
        <div className="dstat">
          <div className="v">{pct(p.thinkingPct)}</div>
          <div className="l">Model / orchestration</div>
        </div>
        <div className="dstat">
          <div className="v">{slowest ? fmtMs(slowest.waitMs) : "—"}</div>
          <div className="l">Slowest step</div>
        </div>
      </div>

      <BucketBar profile={p} />

      <h4 className="lat-h4">Step waterfall</h4>
      <Waterfall profile={p} />

      <h4 className="lat-h4">Steps</h4>
      <StepTable profile={p} />

      <h4 className="lat-h4">Suggestions</h4>
      <Suggestions items={p.suggestions} onOpenFlows={onOpenFlows} />
    </div>
  );
}

/* ---------------------------------------------------------------- run rows */

type RunSort = "date" | "turn" | "steps" | "thinking";

function RunRow({
  run,
  isOpen,
  onToggle,
  onOpenFlows,
}: {
  run: RunInfo;
  isOpen: boolean;
  onToggle: () => void;
  onOpenFlows?: () => void;
}) {
  const p = run.latency!;
  const slow = p.totalMs >= SLOW_TURN_MS;
  const sugg = p.suggestions.filter((s) => s.severity === "high").length;
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td>{isOpen ? "▾" : "▸"} {run.agentLabel}</td>
        <td>{shortDate(run.createdon)}</td>
        <td className="num">
          {slow && <span title="Slow turn">🔴 </span>}
          {fmtMs(p.totalMs)}
        </td>
        <td className="num">{p.steps.length}</td>
        <td className="num">{pct(p.thinkingPct)}</td>
        <td className="num">
          {sugg > 0 ? <span className="pill fail">{sugg} high</span> : <span className="muted">—</span>}
        </td>
      </tr>
      {isOpen && (
        <tr className="lat-detail-row">
          <td colSpan={6}>
            <RunDetail run={run} onOpenFlows={onOpenFlows} />
          </td>
        </tr>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- page */

export function LatencyPanel({
  runs,
  onOpenFlows,
}: {
  runs: RunInfo[];
  onOpenFlows?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RunSort>("turn");
  const [open, setOpen] = useState<string | null>(null);
  const { sort: agSort, onSort: onAgSort } = useSort<
    "agent" | "turns" | "median" | "p90" | "tools" | "thinking" | "slow"
  >("median", "desc");

  const timed = useMemo(() => timedRuns(runs), [runs]);
  const summary = useMemo(() => latencyFleetSummary(runs), [runs]);
  const byAgent = useMemo(() => latencyByAgent(runs), [runs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? timed.filter((r) => r.agentLabel.toLowerCase().includes(q)) : timed.slice();
    const val = (r: RunInfo): number | string => {
      const p = r.latency!;
      switch (sort) {
        case "turn": return -p.totalMs;
        case "steps": return -p.steps.length;
        case "thinking": return -p.thinkingPct;
        case "date": return r.createdon;
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(bv).localeCompare(String(av));
    });
  }, [timed, search, sort]);

  if (timed.length === 0) {
    return (
      <div className="card">
        <h2>Latency</h2>
        <p className="muted">
          No transcripts with per-step timing in this window. Only <strong>orchestrated</strong>{" "}
          (autonomous / multi-agent) agents emit the plan-step lifecycle needed to measure latency —
          classic and simple agents don't record step timestamps.
          {runs.length > 0 && ` ${runs.length} transcript(s) were loaded but none carried timing.`}
        </p>
        <p className="lat-credit">
          The latency &amp; step-timing heuristics in this tab are ported from{" "}
          <a
            href="https://github.com/Roelzz/mcs-agent-analyser"
            target="_blank"
            rel="noreferrer"
          >
            Roel's mcs-agent-analyser
          </a>{" "}
          (MIT licensed) — thanks to Roel for the original analysis approach that inspired this build.
        </p>
      </div>
    );
  }

  return (
    <div className="lat-page">
      <div className="lat-kpis">
        <div className="card lat-kpi">
          <div className="lat-kpi-v">{fmtMs(summary.medianTurnMs)}</div>
          <div className="lat-kpi-l">Median turn time</div>
        </div>
        <div className="card lat-kpi">
          <div className="lat-kpi-v">{fmtMs(summary.p90TurnMs)}</div>
          <div className="lat-kpi-l">P90 turn time</div>
        </div>
        <div className="card lat-kpi">
          <div className="lat-kpi-v">{pct(summary.avgThinkingPct)}</div>
          <div className="lat-kpi-l">Avg model / orchestration</div>
        </div>
        <div className="card lat-kpi">
          <div className="lat-kpi-v">{fmtMs(summary.slowestRunMs)}</div>
          <div className="lat-kpi-l">Slowest turn</div>
        </div>
        <div className="card lat-kpi">
          <div className="lat-kpi-v">
            {summary.slowRuns}
            <span className="muted" style={{ fontSize: 13 }}> / {summary.timedRuns}</span>
          </div>
          <div className="lat-kpi-l">Slow turns (≥ {fmtMs(SLOW_TURN_MS)})</div>
        </div>
      </div>

      {byAgent.length > 0 && (
        <div className="card">
          <h2>By agent</h2>
          <table className="subtable">
            <thead>
              <tr>
                <SortTh col="agent" label="Agent" sort={agSort} onSort={onAgSort} />
                <SortTh col="turns" label="Turns" sort={agSort} onSort={onAgSort} numeric />
                <SortTh col="median" label="Median" sort={agSort} onSort={onAgSort} numeric />
                <SortTh col="p90" label="P90" sort={agSort} onSort={onAgSort} numeric />
                <SortTh col="tools" label="Avg tools" sort={agSort} onSort={onAgSort} numeric />
                <SortTh col="thinking" label="Avg thinking" sort={agSort} onSort={onAgSort} numeric />
                <SortTh col="slow" label="Slow" sort={agSort} onSort={onAgSort} numeric />
              </tr>
            </thead>
            <tbody>
              {sortBy(byAgent, agSort, (a, k) =>
                k === "agent"
                  ? a.label
                  : k === "turns"
                    ? a.runs
                    : k === "median"
                      ? a.medianTurnMs
                      : k === "p90"
                        ? a.p90TurnMs
                        : k === "tools"
                          ? a.avgToolMs
                          : k === "thinking"
                            ? a.avgThinkingPct
                            : a.slowRuns
              ).map((a) => (
                <tr key={a.key}>
                  <td>{a.label}</td>
                  <td className="num">{a.runs}</td>
                  <td className="num">{fmtMs(a.medianTurnMs)}</td>
                  <td className="num">{fmtMs(a.p90TurnMs)}</td>
                  <td className="num">{fmtMs(a.avgToolMs)}</td>
                  <td className="num">{pct(a.avgThinkingPct)}</td>
                  <td className="num">{a.slowRuns > 0 ? <span className="pill warn">{a.slowRuns}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="flex-between">
          <h2>Turns ({rows.length})</h2>
          <div className="conv-tools">
            <input
              className="conv-search"
              placeholder="Search agent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as RunSort)}>
              <option value="turn">Slowest turn</option>
              <option value="thinking">Most model time</option>
              <option value="steps">Most steps</option>
              <option value="date">Newest</option>
            </select>
          </div>
        </div>
        <p className="muted">
          Click a turn to see its step waterfall, per-step timing and improvement suggestions.
        </p>
        {rows.length === 0 ? (
          <p className="muted">No turns match.</p>
        ) : (
          <table className="subtable">
            <thead>
              <tr>
                <th>Agent</th>
                <th>When</th>
                <th className="num">Turn time</th>
                <th className="num">Steps</th>
                <th className="num">Model %</th>
                <th className="num">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  isOpen={open === r.id}
                  onToggle={() => setOpen(open === r.id ? null : r.id)}
                  onOpenFlows={onOpenFlows}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="lat-credit">
        The latency &amp; step-timing heuristics in this tab are ported from{" "}
        <a
          href="https://github.com/Roelzz/mcs-agent-analyser"
          target="_blank"
          rel="noreferrer"
        >
          Roel's mcs-agent-analyser
        </a>{" "}
        (MIT licensed) — thanks to Roel for the original analysis approach that inspired this build.
      </p>
    </div>
  );
}
