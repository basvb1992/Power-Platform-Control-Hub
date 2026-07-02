import { describe, it, expect } from "vitest";
import {
  ACADEMY,
  BEST_PRACTICES,
  HIGH_COST_CREDITS_PER_CONV,
  academyLinkForFindingCategory,
  bestPracticesForSignal,
  detectContentSignals,
  modulesById,
  runCredits,
  runUsesMcp,
  signalForFindingCategory,
} from "./academy";
import type { AgentInventoryItem } from "./data";
import type { RunInfo, StepInfo } from "./costEngine";

function item(over: Partial<AgentInventoryItem> = {}): AgentInventoryItem {
  return {
    botid: "b",
    name: "Agent",
    schemaname: "vbd_Agent",
    state: "Active",
    owner: "Alice",
    createdon: "2026-05-01T00:00:00Z",
    publishedon: "2026-06-20T00:00:00Z",
    authMode: "Azure AD",
    languages: "en-US",
    model: "",
    kind: "Generative",
    template: "default-2.1.0",
    ...over,
  };
}

function step(over: Partial<StepInfo> = {}): StepInfo {
  return { tool: "vbd_Agent.action.x", state: "completed", cost: 7, kind: "Action", thought: "", ...over };
}

function run(schema: string, steps: StepInfo[], latency: RunInfo["latency"] = null): RunInfo {
  return {
    id: "r",
    conversationId: "c",
    createdon: "2026-06-21T00:00:00Z",
    agentSchema: schema,
    agentLabel: schema,
    steps,
    engineCost: steps.reduce((s, x) => s + x.cost, 0),
    messages: [],
    events: [],
    latency,
  };
}

describe("academy index", () => {
  it("every module has a grounded microsoft.github.io URL", () => {
    for (const m of ACADEMY) {
      expect(m.url.startsWith("https://microsoft.github.io/agent-academy/")).toBe(true);
      expect(m.title.length).toBeGreaterThan(0);
    }
  });

  it("module ids are unique", () => {
    const ids = ACADEMY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every best practice references at least one existing module", () => {
    for (const bp of BEST_PRACTICES) {
      const mods = modulesById(bp.moduleIds);
      expect(mods.length).toBe(bp.moduleIds.length);
      expect(mods.length).toBeGreaterThan(0);
      expect(bp.signals.length).toBeGreaterThan(0);
    }
  });
});

describe("finding → academy mapping", () => {
  it("maps known governance categories to a signal", () => {
    expect(signalForFindingCategory("Orphaned")).toBe("orphaned");
    expect(signalForFindingCategory("No authentication")).toBe("no-auth");
    expect(signalForFindingCategory("High failure rate")).toBe("high-failure");
    expect(signalForFindingCategory("Premium connector")).toBe("premium-connector");
  });

  it("returns null for unknown categories", () => {
    expect(signalForFindingCategory("Nonexistent")).toBeNull();
  });

  it("bestPracticesForSignal finds guidance for a live signal", () => {
    expect(bestPracticesForSignal("orphaned").length).toBeGreaterThan(0);
    expect(bestPracticesForSignal("no-auth").length).toBeGreaterThan(0);
  });

  it("academyLinkForFindingCategory returns a practice + module for a real finding", () => {
    const link = academyLinkForFindingCategory("No authentication");
    expect(link).not.toBeNull();
    expect(link?.module.url.startsWith("https://microsoft.github.io/agent-academy/")).toBe(true);
    expect(link?.practice.moduleIds).toContain(link?.module.id);
  });

  it("academyLinkForFindingCategory returns null for a category with no practice", () => {
    expect(academyLinkForFindingCategory("Nonexistent")).toBeNull();
  });
});

describe("detectContentSignals", () => {
  it("flags classic agents from the inventory kind", () => {
    const d = detectContentSignals([item({ kind: "Classic" }), item({ kind: "Generative" })], []);
    expect(d.signals.has("classic-agent")).toBe(true);
    expect(d.counts["classic-agent"]).toBe(1);
  });

  it("flags high-cost agents whose average credits/conversation exceed the threshold", () => {
    const pricey = [
      run("vbd_Pricey", [step({ cost: 13 }), step({ cost: 7 })]),
      run("vbd_Pricey", [step({ cost: 13 }), step({ cost: 7 })]),
    ];
    const cheap = [run("vbd_Cheap", [step({ cost: 1 })])];
    const d = detectContentSignals([], [...pricey, ...cheap]);
    // Pricey avg = 20 >= threshold; Cheap avg = 1 < threshold.
    expect(HIGH_COST_CREDITS_PER_CONV).toBeGreaterThan(1);
    expect(d.signals.has("high-cost")).toBe(true);
    expect(d.counts["high-cost"]).toBe(1);
  });

  it("flags slow-latency agents with a slow timed turn", () => {
    const slow = run("vbd_Slow", [step()], { hasTiming: true, totalMs: 20000 } as RunInfo["latency"]);
    const fast = run("vbd_Fast", [step()], { hasTiming: true, totalMs: 1000 } as RunInfo["latency"]);
    const d = detectContentSignals([], [slow, fast]);
    expect(d.signals.has("slow-latency")).toBe(true);
    expect(d.counts["slow-latency"]).toBe(1);
  });

  it("flags MCP tool usage from step identifiers", () => {
    expect(runUsesMcp(run("x", [step({ tool: "contoso.mcp.search" })]))).toBe(true);
    expect(runUsesMcp(run("x", [step({ tool: "vbd_Agent.action.x" })]))).toBe(false);
    const d = detectContentSignals([], [run("vbd_Mcp", [step({ tool: "acme.MCP.tool" })])]);
    expect(d.signals.has("uses-mcp")).toBe(true);
    expect(d.counts["uses-mcp"]).toBe(1);
  });

  it("runCredits sums billable step costs", () => {
    expect(runCredits(run("x", [step({ cost: 5 }), step({ cost: 2 })]))).toBe(7);
  });

  it("returns no signals for empty input", () => {
    const d = detectContentSignals([], []);
    expect(d.signals.size).toBe(0);
  });
});
