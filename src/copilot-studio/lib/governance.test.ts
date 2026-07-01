import { describe, it, expect } from "vitest";
import {
  isOrphaned,
  isNoAuth,
  daysBetween,
  failRateOf,
  evaluateAgent,
  buildGovernance,
  type GovernanceThresholds,
} from "./governance";
import type { AgentInventoryItem } from "./data";
import type { RunInfo, StepInfo } from "./costEngine";
import type { ConnectionRef } from "./connections";

const NOW = new Date("2026-06-26T00:00:00Z");
const THRESH: GovernanceThresholds = {
  staleAfterDays: 30,
  failRateHigh: 0.25,
  minRunsForFailRate: 3,
  now: NOW,
};

function agent(over: Partial<AgentInventoryItem> = {}): AgentInventoryItem {
  return {
    botid: "b1",
    name: "Coach",
    schemaname: "vbd_Coach",
    state: "Active",
    owner: "Alice",
    createdon: "2026-05-01T00:00:00Z",
    publishedon: "2026-06-20T00:00:00Z",
    authMode: "Azure AD",
    languages: "en-US",
    ...over,
  };
}

function step(over: Partial<StepInfo> = {}): StepInfo {
  return { tool: "vbd_Coach.action.x", state: "completed", cost: 7, kind: "Action", thought: "", ...over };
}

function run(schema: string, steps: StepInfo[]): RunInfo {
  return {
    id: "r",
    conversationId: "c",
    createdon: "2026-06-21T00:00:00Z",
    agentSchema: schema,
    agentLabel: "Coach",
    steps,
    engineCost: steps.reduce((s, x) => s + x.cost, 0),
    messages: [],
    events: [],
  };
}

describe("predicates", () => {
  it("isOrphaned detects missing/placeholder owners", () => {
    expect(isOrphaned("")).toBe(true);
    expect(isOrphaned("  ")).toBe(true);
    expect(isOrphaned("—")).toBe(true);
    expect(isOrphaned("SYSTEM")).toBe(true);
    expect(isOrphaned("Alice")).toBe(false);
  });
  it("isNoAuth detects no-auth modes", () => {
    expect(isNoAuth("No authentication")).toBe(true);
    expect(isNoAuth("None")).toBe(true);
    expect(isNoAuth("Geen")).toBe(true);
    expect(isNoAuth("Azure AD")).toBe(false);
  });
  it("daysBetween computes whole days and guards bad input", () => {
    expect(daysBetween("2026-06-16T00:00:00Z", NOW)).toBe(10);
    expect(daysBetween("", NOW)).toBeNull();
    expect(daysBetween("not-a-date", NOW)).toBeNull();
  });
  it("failRateOf computes failed/total or null", () => {
    expect(failRateOf([])).toBeNull();
    expect(failRateOf([run("vbd_Coach", [step(), step({ state: "failed", cost: 0 })])])).toBe(0.5);
  });
});

describe("evaluateAgent", () => {
  const noConn: ConnectionRef[] = [];

  it("flags a clean, recently published, owned agent with traffic as no findings", () => {
    const runs = [run("vbd_Coach", [step(), step(), step()])];
    const g = evaluateAgent(agent(), runs, noConn, THRESH);
    expect(g.findings).toHaveLength(0);
    expect(g.score).toBe(0);
    expect(g.conversations).toBe(1);
  });

  it("flags orphaned (high) when owner missing", () => {
    const g = evaluateAgent(agent({ owner: "" }), [run("vbd_Coach", [step()])], noConn, THRESH);
    expect(g.findings.some((f) => f.category === "Orphaned" && f.severity === "high")).toBe(true);
  });

  it("flags unpublished (medium) when publishedon empty", () => {
    const g = evaluateAgent(agent({ publishedon: "" }), [run("vbd_Coach", [step()])], noConn, THRESH);
    expect(g.findings.some((f) => f.category === "Unpublished")).toBe(true);
  });

  it("flags stale when last published beyond threshold", () => {
    const g = evaluateAgent(
      agent({ publishedon: "2026-01-01T00:00:00Z" }),
      [run("vbd_Coach", [step()])],
      noConn,
      THRESH
    );
    expect(g.findings.some((f) => f.category === "Stale")).toBe(true);
  });

  it("flags inactive (low) when active but no runs", () => {
    const g = evaluateAgent(agent(), [], noConn, THRESH);
    expect(g.findings.some((f) => f.category === "Inactive" && f.severity === "low")).toBe(true);
  });

  it("flags no-authentication", () => {
    const g = evaluateAgent(agent({ authMode: "No authentication" }), [run("vbd_Coach", [step()])], noConn, THRESH);
    expect(g.findings.some((f) => f.category === "No authentication")).toBe(true);
  });

  it("flags high failure rate only above min runs", () => {
    const failing = [
      run("vbd_Coach", [step({ state: "failed", cost: 0 }), step()]),
      run("vbd_Coach", [step({ state: "failed", cost: 0 }), step({ state: "failed", cost: 0 })]),
      run("vbd_Coach", [step({ state: "failed", cost: 0 }), step()]),
    ];
    const g = evaluateAgent(agent(), failing, noConn, THRESH);
    expect(g.findings.some((f) => f.category === "High failure rate" && f.severity === "high")).toBe(true);
  });

  it("flags premium connector use", () => {
    const conn: ConnectionRef[] = [
      {
        displayName: "vbd_Coach.shared_sql.conn",
        logicalName: "vbd_Coach.shared_sql.conn",
        connectorId: "/providers/Microsoft.PowerApps/apis/shared_sql",
      },
    ];
    const g = evaluateAgent(agent(), [run("vbd_Coach", [step()])], conn, THRESH);
    expect(g.findings.some((f) => f.category === "Premium connector")).toBe(true);
  });
});

describe("buildGovernance", () => {
  it("rolls up severity and category counts and sorts by score", () => {
    const items = [
      agent({ botid: "ok", schemaname: "vbd_Ok" }),
      agent({ botid: "bad", schemaname: "vbd_Bad", owner: "", publishedon: "" }),
    ];
    const runs = [run("vbd_Ok", [step(), step(), step()])];
    const summary = buildGovernance(items, runs, [], THRESH);
    expect(summary.agents).toHaveLength(2);
    expect(summary.agents[0].botid).toBe("bad"); // highest score first
    expect(summary.clean).toBe(1);
    expect(summary.high).toBeGreaterThanOrEqual(1);
    expect(summary.byCategory["Orphaned"]).toBe(1);
  });
});
