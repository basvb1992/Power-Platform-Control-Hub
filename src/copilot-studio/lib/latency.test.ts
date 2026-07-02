import { describe, it, expect } from "vitest";
import {
  parseTimeSpanMs,
  fmtMs,
  buildLatencyProfile,
  timedRuns,
  latencyByAgent,
  latencyFleetSummary,
  BIG_GAP_MS,
} from "./latency";
import { parseTranscript, type RunInfo } from "./costEngine";

/* ----------------------------------------------------------- fixtures */

const ACTION_TOOL = "vbd_Coach.action.MicrosoftDataverse-ListRows";
const KNOWLEDGE_TOOL = "vbd_Coach.knowledge.UniversalSearchTool";

/** Mirrors the real orchestrated-transcript activity shape (timestampMs, plan lifecycle). */
function activities() {
  return [
    { type: "trace", valueType: "ConversationInfo", timestampMs: 1_000_000 },
    { type: "message", from: { role: "user" }, text: "hi", timestampMs: 1_000_000 },
    {
      type: "event",
      name: "DynamicPlanStepTriggered",
      timestampMs: 1_000_000,
      value: { stepId: "A", taskDialogId: ACTION_TOOL, thought: "look up rows", state: "running" },
    },
    {
      type: "event",
      name: "DynamicPlanStepFinished",
      timestampMs: 1_001_000,
      value: {
        stepId: "A",
        taskDialogId: ACTION_TOOL,
        executionTime: "00:00:00.9000000",
        state: "completed",
        displayedCost: 7,
      },
    },
    {
      type: "event",
      name: "DynamicPlanStepTriggered",
      timestampMs: 1_009_000, // 8s idle gap after A finished → biggest gap
      value: { stepId: "B", taskDialogId: KNOWLEDGE_TOOL, thought: "search kb", state: "running" },
    },
    {
      type: "event",
      name: "DynamicPlanStepFinished",
      timestampMs: 1_015_000,
      value: {
        stepId: "B",
        taskDialogId: KNOWLEDGE_TOOL,
        executionTime: "00:00:05.0000000",
        state: "completed",
        displayedCost: 2,
      },
    },
    { type: "message", from: { role: "bot" }, text: "done", timestampMs: 1_015_000 },
  ];
}

/* ----------------------------------------------------------- timespan */

describe("parseTimeSpanMs", () => {
  it("parses fractional seconds", () => {
    expect(parseTimeSpanMs("00:00:00.9000000")).toBe(900);
    expect(parseTimeSpanMs("00:00:05.0000000")).toBe(5000);
  });
  it("parses minutes and seconds", () => {
    expect(parseTimeSpanMs("00:01:23.5")).toBe(83_500);
  });
  it("parses days", () => {
    expect(parseTimeSpanMs("1.02:03:04")).toBe((86_400 + 7_200 + 180 + 4) * 1000);
  });
  it("returns 0 for junk", () => {
    expect(parseTimeSpanMs("nope")).toBe(0);
    expect(parseTimeSpanMs(undefined)).toBe(0);
  });
});

describe("fmtMs", () => {
  it("formats sub-second, seconds and minutes", () => {
    expect(fmtMs(500)).toBe("500 ms");
    expect(fmtMs(1500)).toBe("1.5 s");
    expect(fmtMs(90_000)).toBe("1m 30s");
  });
});

/* ------------------------------------------------------ profile shape */

describe("buildLatencyProfile", () => {
  it("returns null when there is nothing to analyse", () => {
    expect(buildLatencyProfile([])).toBeNull();
    expect(buildLatencyProfile([{ type: "message", text: "hi" }])).toBeNull();
  });

  it("times steps, classifies kinds and splits exec vs overhead", () => {
    const p = buildLatencyProfile(activities())!;
    expect(p).not.toBeNull();
    expect(p.hasTiming).toBe(true);
    expect(p.totalMs).toBe(15_000);
    expect(p.steps).toHaveLength(2);

    const [a, b] = p.steps;
    expect(a.kind).toBe("Action");
    expect(a.waitMs).toBe(1_000);
    expect(a.execMs).toBe(900);
    expect(a.overheadMs).toBe(100);

    expect(b.kind).toBe("Knowledge");
    expect(b.waitMs).toBe(6_000);
    expect(b.execMs).toBe(5_000);
    expect(b.overheadMs).toBe(1_000);
  });

  it("computes thinking time, slowest step and biggest gap", () => {
    const p = buildLatencyProfile(activities())!;
    // stepWall = 1000 + 6000 = 7000; total 15000 → thinking 8000
    expect(p.thinkingMs).toBe(8_000);
    expect(p.thinkingPct).toBeCloseTo(8_000 / 15_000, 5);
    expect(p.slowestStepIndex).toBe(1); // step B waits longest
    expect(p.biggestGapMs).toBe(8_000);
    expect(p.biggestGapAfterIndex).toBe(0); // gap sits after step A
    expect(p.toolMs).toBe(900);
    expect(p.knowledgeMs).toBe(5_000);
  });

  it("emits a high-severity model-reasoning suggestion when thinking dominates", () => {
    const p = buildLatencyProfile(activities())!;
    const titles = p.suggestions.map((s) => s.title);
    expect(titles).toContain("Model reasoning is the bottleneck");
    expect(p.suggestions.some((s) => s.severity === "high")).toBe(true);
    expect(p.biggestGapMs).toBeGreaterThanOrEqual(BIG_GAP_MS);
  });

  it("falls back to timestamp (epoch seconds) when timestampMs is absent", () => {
    const acts = [
      {
        type: "event",
        name: "DynamicPlanStepTriggered",
        timestamp: 2000,
        value: { stepId: "X", taskDialogId: ACTION_TOOL },
      },
      {
        type: "event",
        name: "DynamicPlanStepFinished",
        timestamp: 2003,
        value: { stepId: "X", taskDialogId: ACTION_TOOL, executionTime: "00:00:02", displayedCost: 5 },
      },
    ];
    const p = buildLatencyProfile(acts)!;
    expect(p.totalMs).toBe(3_000); // 2003s - 2000s
    expect(p.steps[0].waitMs).toBe(3_000);
  });
});

/* -------------------------------------------------------- fleet views */

describe("fleet views", () => {
  function run(id: string): RunInfo {
    return parseTranscript(
      { conversationtranscriptid: id, name: `${id}_x`, createdon: "2026-07-01T00:00:00Z", content: JSON.stringify({ activities: activities() }) },
      { "vbd_coach": "Coach" }
    )!;
  }

  it("only counts runs with usable timing", () => {
    const runs = [run("r1"), run("r2")];
    expect(timedRuns(runs)).toHaveLength(2);
    const s = latencyFleetSummary(runs);
    expect(s.timedRuns).toBe(2);
    expect(s.medianTurnMs).toBe(15_000);
  });

  it("rolls up per agent", () => {
    const rollup = latencyByAgent([run("r1"), run("r2")]);
    expect(rollup).toHaveLength(1);
    expect(rollup[0].runs).toBe(2);
    expect(rollup[0].p90TurnMs).toBe(15_000);
  });
});
