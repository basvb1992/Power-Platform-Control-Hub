import { describe, it, expect } from "vitest";
import {
  classifyTool,
  humanize,
  agentLabel,
  isFailedStep,
  parseTranscript,
  aggregateByAgent,
  totals,
  runCredits,
  type StepInfo,
  type BotMap,
} from "./costEngine";

describe("classifyTool", () => {
  it("recognises connected agents", () => {
    expect(classifyTool("vbd_Coach.InvokeConnectedAgent.x")).toBe("Connected agent");
  });
  it("recognises knowledge search", () => {
    expect(classifyTool("UniversalSearchTool")).toBe("Knowledge");
  });
  it("recognises actions", () => {
    expect(classifyTool("vbd_Coach.action.createTask")).toBe("Action");
  });
  it("falls back to Other / Step", () => {
    expect(classifyTool("somethingElse")).toBe("Other");
    expect(classifyTool("")).toBe("Step");
  });
});

describe("humanize", () => {
  it("strips prefix and splits camelCase", () => {
    expect(humanize("vbd_UnicaProjectCoach")).toBe("Unica Project Coach");
  });
  it("separates the agent suffix", () => {
    expect(humanize("vbd_UnicaMensenagent")).toBe("Unica Mensen Agent");
  });
});

describe("agentLabel", () => {
  const map: BotMap = { vbd_coach: "Project Coach" };
  it("prefers the bot map display name", () => {
    expect(agentLabel("vbd_Coach", map)).toBe("Project Coach");
  });
  it("humanizes when unmapped", () => {
    expect(agentLabel("vbd_OtherBot", map)).toBe("Other Bot");
  });
  it("guards unknown", () => {
    expect(agentLabel("(unknown)", map)).toBe("(unknown)");
  });
});

describe("isFailedStep", () => {
  const step = (over: Partial<StepInfo>): StepInfo => ({
    tool: "t",
    state: "completed",
    cost: 7,
    kind: "Action",
    thought: "",
    ...over,
  });
  it("treats state failed as failed", () => {
    expect(isFailedStep(step({ state: "failed" }))).toBe(true);
  });
  it("treats zero cost as failed", () => {
    expect(isFailedStep(step({ cost: 0 }))).toBe(true);
  });
  it("treats a 7-credit completed step as success", () => {
    expect(isFailedStep(step({}))).toBe(false);
  });
});

function transcript(activities: unknown[], extra: Record<string, unknown> = {}) {
  return {
    conversationtranscriptid: "tid-1",
    createdon: "2026-06-01T10:00:00Z",
    content: JSON.stringify({ activities }),
    ...extra,
  };
}

describe("parseTranscript", () => {
  it("returns null when there are no billable steps", () => {
    const rec = transcript([{ type: "message", text: "hi", from: { role: "user" } }]);
    expect(parseTranscript(rec, {})).toBeNull();
  });

  it("returns null on malformed JSON content", () => {
    const rec = { conversationtranscriptid: "x", content: "{not json" };
    expect(parseTranscript(rec, {})).toBeNull();
  });

  it("extracts steps, cost, schema and conversation id", () => {
    const rec = transcript(
      [
        {
          value: {
            taskDialogId: "vbd_Coach.action.createTask",
            displayedCost: 7,
            state: "completed",
            thought: "creating",
          },
        },
        {
          value: { taskDialogId: "vbd_Coach.action.fail", displayedCost: 0, state: "failed" },
        },
        { type: "message", text: "Hello", from: { role: "user" } },
        { type: "message", text: "Hi there", from: { role: "bot" } },
      ],
      { name: "conv-123_bot-9" }
    );
    const run = parseTranscript(rec, { vbd_coach: "Project Coach" });
    expect(run).not.toBeNull();
    expect(run!.steps).toHaveLength(2);
    expect(run!.engineCost).toBe(7);
    expect(run!.agentSchema).toBe("vbd_Coach");
    expect(run!.agentLabel).toBe("Project Coach");
    expect(run!.conversationId).toBe("conv-123");
    expect(run!.messages).toHaveLength(2);
    expect(run!.messages[0]).toMatchObject({ role: "user", text: "Hello" });
  });

  it("falls back conversationId to transcript id when name absent", () => {
    const rec = transcript([
      { value: { taskDialogId: "vbd_Coach.action.x", displayedCost: 7, state: "completed" } },
    ]);
    const run = parseTranscript(rec, {});
    expect(run!.conversationId).toBe("tid-1");
  });
});

describe("aggregateByAgent + totals + runCredits", () => {
  const mkRun = (schema: string, steps: Array<[number, string]>) => {
    const rec = transcript(
      steps.map(([cost, state]) => ({
        value: { taskDialogId: `${schema}.action.x`, displayedCost: cost, state },
      }))
    );
    return parseTranscript(rec, {})!;
  };

  const runs = [
    mkRun("vbd_A", [
      [7, "completed"],
      [7, "completed"],
      [0, "failed"],
    ]),
    mkRun("vbd_B", [[7, "completed"]]),
  ];

  it("rolls up credits per agent and sorts by spend", () => {
    const agg = aggregateByAgent(runs);
    expect(agg).toHaveLength(2);
    expect(agg[0].credits).toBe(14); // agent A: two completed * 7
    expect(agg[0].completed).toBe(2);
    expect(agg[0].failed).toBe(1);
    expect(agg[1].credits).toBe(7);
  });

  it("flags deep reasoning from the configured model, not transcripts", () => {
    const agg = aggregateByAgent(runs, { vbd_a: "GPT5Chat", vbd_b: "o3" });
    const a = agg.find((x) => x.key.includes("A") || x.label.includes("A"));
    const b = agg.find((x) => x.key.includes("B") || x.label.includes("B"));
    // vbd_A uses a standard model → not flagged; model label surfaced.
    expect(a?.deepReasoning).toBe(false);
    expect(a?.modelLabel).toBe("GPT-5 chat");
    expect(a?.modelTier).toBe("standard");
    // vbd_B uses o3 (premium reasoning) → flagged.
    expect(b?.deepReasoning).toBe(true);
    expect(b?.modelTier).toBe("premium");
  });

  it("leaves model unknown when no config is supplied", () => {
    const agg = aggregateByAgent(runs);
    expect(agg[0].deepReasoning).toBe(false);
    expect(agg[0].modelTier).toBe("unknown");
  });

  it("totals across the window", () => {
    const t = totals(runs);
    expect(t.transcripts).toBe(2);
    expect(t.completed).toBe(3);
    expect(t.failed).toBe(1);
    expect(t.credits).toBe(21);
  });

  it("runCredits counts only successful steps", () => {
    expect(runCredits(runs[0])).toBe(14);
    expect(runCredits(runs[1])).toBe(7);
  });
});
