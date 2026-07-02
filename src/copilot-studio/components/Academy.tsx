/**
 * Academy panel — an in-app knowledge base built from the Copilot Studio Agent
 * Academy (https://microsoft.github.io/agent-academy/). It does two things:
 *
 *   1. "Recommended for this environment" — surfaces the best practices whose
 *      signals are currently detected in the loaded fleet (governance findings,
 *      classic agents) and deep-links to the exact module that teaches the fix.
 *   2. "Browse the Academy" — a searchable index of every track / module / lab.
 *
 * All content is static (lib/academy.ts); no Dataverse round-trip is needed.
 */
import { useMemo, useState } from "react";
import type { RunInfo } from "../lib/costEngine";
import type { AgentInventoryItem } from "../lib/data";
import type { ConnectionRef } from "../lib/connections";
import { buildGovernance } from "../lib/governance";
import {
  ACADEMY,
  ACADEMY_HOME,
  ACADEMY_TRACKS,
  BEST_PRACTICES,
  detectContentSignals,
  modulesById,
  signalForFindingCategory,
  type AcademyTrack,
  type BestPractice,
  type SignalKey,
} from "../lib/academy";

const TRACK_ORDER: AcademyTrack[] = ["Recruit", "Operative", "Special Ops", "Cowork Collective"];

function ModuleLinks({ bp }: { bp: BestPractice }) {
  const mods = modulesById(bp.moduleIds);
  return (
    <div className="ac-links">
      {mods.map((m) => (
        <a key={m.id} href={m.url} target="_blank" rel="noreferrer" title={m.summary}>
          {m.track}
          {m.code ? ` · ${m.code}` : ""} · {m.title} →
        </a>
      ))}
    </div>
  );
}

function BestPracticeCard({
  bp,
  active,
  count,
}: {
  bp: BestPractice;
  active: boolean;
  count?: number;
}) {
  return (
    <div className={`ac-bp ${active ? "ac-bp-active" : ""}`}>
      <div className="ac-bp-head">
        <span className={`pill kind ac-cat-${bp.category.toLowerCase()}`}>{bp.category}</span>
        <strong>{bp.title}</strong>
        {active && count !== undefined && count > 0 && (
          <span className="pill score sev-med" title="Agents affected in this environment">
            {count} affected
          </span>
        )}
      </div>
      <p className="ac-bp-tip">{bp.tip}</p>
      <ModuleLinks bp={bp} />
    </div>
  );
}

export function AcademyPanel({
  items,
  runs,
  connRefs,
}: {
  items: AgentInventoryItem[];
  runs: RunInfo[];
  connRefs: ConnectionRef[];
}) {
  const [q, setQ] = useState("");
  const [track, setTrack] = useState<AcademyTrack | "all">("all");

  /** Signals detected in the loaded environment + how many agents each hits. */
  const { activeSignals, counts } = useMemo(() => {
    const counts: Partial<Record<SignalKey, number>> = {};
    const active = new Set<SignalKey>();
    if (items.length) {
      // Governance-finding signals (need connection refs, so build here).
      const gov = buildGovernance(items, runs, connRefs);
      for (const agent of gov.agents) {
        const seen = new Set<SignalKey>();
        for (const f of agent.findings) {
          const sig = signalForFindingCategory(f.category);
          if (sig && !seen.has(sig)) {
            seen.add(sig);
            active.add(sig);
            counts[sig] = (counts[sig] ?? 0) + 1;
          }
        }
      }
      // Content / behaviour signals inferred from inventory + transcripts.
      const content = detectContentSignals(items, runs);
      for (const sig of content.signals) {
        active.add(sig);
        counts[sig] = content.counts[sig] ?? counts[sig];
      }
    }
    return { activeSignals: active, counts };
  }, [items, runs, connRefs]);

  const recommended = BEST_PRACTICES.filter((bp) =>
    bp.signals.some((s) => activeSignals.has(s))
  );
  const other = BEST_PRACTICES.filter((bp) => !recommended.includes(bp));

  const bpCount = (bp: BestPractice): number =>
    bp.signals.reduce((n, s) => n + (counts[s] ?? 0), 0);

  const needle = q.trim().toLowerCase();
  const modules = ACADEMY.filter((m) => {
    if (track !== "all" && m.track !== track) return false;
    if (!needle) return true;
    return (
      m.title.toLowerCase().includes(needle) ||
      m.summary.toLowerCase().includes(needle) ||
      m.tags.some((t) => t.includes(needle))
    );
  });

  return (
    <>
      <div className="card">
        <h2>Copilot Studio Agent Academy</h2>
        <p className="muted">
          Best practices distilled from the free, open-source{" "}
          <a href={ACADEMY_HOME} target="_blank" rel="noreferrer">
            Microsoft Copilot Studio Agent Academy
          </a>
          . Findings detected in this environment are matched to the exact module that
          teaches the fix — click any link to jump straight to the lab.
        </p>
      </div>

      {items.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            Recommended for this environment{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              ({recommended.length})
            </span>
          </h2>
          {recommended.length === 0 ? (
            <p className="muted">
              No matching signals in the loaded data — nice. Browse the full catalogue below.
            </p>
          ) : (
            <div className="ac-bp-list">
              {recommended.map((bp) => (
                <BestPracticeCard key={bp.id} bp={bp} active count={bpCount(bp)} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>All best practices</h2>
        <div className="ac-bp-list">
          {(items.length > 0 ? other : BEST_PRACTICES).map((bp) => (
            <BestPracticeCard key={bp.id} bp={bp} active={false} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Browse the Academy</h2>
          <div className="ac-browse-controls">
            <input
              className="ac-search"
              placeholder="Search modules & labs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={track} onChange={(e) => setTrack(e.target.value as AcademyTrack | "all")}>
              <option value="all">All tracks</option>
              {TRACK_ORDER.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {track === "all" && !needle && (
          <div className="ac-tracks">
            {ACADEMY_TRACKS.map((t) => (
              <a
                key={t.track}
                className="ac-track"
                href={t.url}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{t.track}</strong>
                <span className="muted">{t.blurb}</span>
              </a>
            ))}
          </div>
        )}

        {TRACK_ORDER.filter((t) => track === "all" || track === t).map((t) => {
          const rows = modules.filter((m) => m.track === t);
          if (rows.length === 0) return null;
          return (
            <div key={t} className="ac-modgroup">
              <h3 className="ac-modgroup-h">{t}</h3>
              <div className="ac-modlist">
                {rows.map((m) => (
                  <a key={m.id} className="ac-mod" href={m.url} target="_blank" rel="noreferrer">
                    {m.code && <span className="ac-mod-code">{m.code}</span>}
                    <span className="ac-mod-title">{m.title}</span>
                    <span className="ac-mod-sum muted">{m.summary}</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        {modules.length === 0 && <p className="muted">No modules match your search.</p>}
      </div>
    </>
  );
}
