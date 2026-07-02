import { describe, it, expect } from "vitest";
import {
  parseToolComponent,
  parseTools,
  indexToolsByFlow,
  indexToolsByPrompt,
  toolsByAgent,
  connectorApiFromRef,
  type RawToolComponent,
} from "./agentTools";

function comp(over: Partial<RawToolComponent> = {}): RawToolComponent {
  return {
    botId: "bot-1",
    name: "Tool",
    schemaname: "vbd_Agent.action.Tool",
    componenttype: 9,
    data: "",
    ...over,
  };
}

const FLOW_ID = "31c27f52-4571-6eba-bf35-ff7585fd69cb";
const CONN_REF =
  "vbd_UnicaMensenagent.shared_commondataserviceforapps.shared-commondataser-c43eb567";

describe("parseToolComponent", () => {
  it("parses an InvokeFlowTaskAction into a flow ref with flowId", () => {
    const ref = parseToolComponent(
      comp({
        name: "Notify Agent Approval Request",
        data: `kind: TaskDialog\naction:\n  kind: InvokeFlowTaskAction\n  flowId: ${FLOW_ID}\n`,
      })
    );
    expect(ref).not.toBeNull();
    expect(ref!.kind).toBe("flow");
    expect(ref!.flowId).toBe(FLOW_ID);
    expect(ref!.toolName).toBe("Notify Agent Approval Request");
  });

  it("parses a WorkflowExternalTrigger into a trigger ref with flowId", () => {
    const ref = parseToolComponent(
      comp({
        componenttype: 17,
        schemaname: "vbd_Agent.trigger.WhenSomeoneSignsOff",
        data: `kind: WorkflowExternalTrigger\nflowId: ${FLOW_ID}\n`,
      })
    );
    expect(ref!.kind).toBe("trigger");
    expect(ref!.flowId).toBe(FLOW_ID);
  });

  it("parses an InvokeConnectorTaskAction into a connector ref", () => {
    const ref = parseToolComponent(
      comp({
        data: `action:\n  kind: InvokeConnectorTaskAction\n  connectionReference: ${CONN_REF}\n`,
      })
    );
    expect(ref!.kind).toBe("connector");
    expect(ref!.connectionReference).toBe(CONN_REF);
    expect(ref!.connectorApi).toBe("shared_commondataserviceforapps");
  });

  it("classifies an external agent connector containing 'mcp' as mcp", () => {
    const ref = parseToolComponent(
      comp({
        data: `action:\n  kind: InvokeExternalAgentTaskAction\n  connectionReference: vbd_Agent.shared_a365memcp.conn-x\n`,
      })
    );
    expect(ref!.kind).toBe("mcp");
    expect(ref!.connectorApi).toBe("shared_a365memcp");
  });

  it("classifies a non-mcp external agent as externalAgent", () => {
    const ref = parseToolComponent(
      comp({
        data: `action:\n  kind: InvokeExternalAgentTaskAction\n  connectionReference: vbd_Agent.shared_powertools.conn-y\n`,
      })
    );
    expect(ref!.kind).toBe("externalAgent");
  });

  it("returns null for a plain topic with no invoking action", () => {
    const ref = parseToolComponent(
      comp({
        schemaname: "vbd_Agent.topic.Greeting",
        data: `kind: TaskDialog\nbeginDialog:\n  kind: OnRecognizedIntent\n`,
      })
    );
    expect(ref).toBeNull();
  });

  it("returns null when data is empty", () => {
    expect(parseToolComponent(comp({ data: "" }))).toBeNull();
  });
});

describe("index + rollup helpers", () => {
  const rows: RawToolComponent[] = [
    comp({
      botId: "botA",
      name: "Flow tool",
      schemaname: "vbd_A.action.FlowTool",
      data: `action:\n  kind: InvokeFlowTaskAction\n  flowId: ${FLOW_ID}\n`,
    }),
    comp({
      botId: "botB",
      name: "Same flow tool",
      schemaname: "vbd_B.action.FlowTool",
      data: `action:\n  kind: InvokeFlowTaskAction\n  flowId: ${FLOW_ID.toUpperCase()}\n`,
    }),
    comp({
      botId: "botA",
      name: "Connector tool",
      schemaname: "vbd_A.action.ConnTool",
      data: `action:\n  kind: InvokeConnectorTaskAction\n  connectionReference: ${CONN_REF}\n`,
    }),
  ];

  it("indexes tools by flow id (case-insensitive)", () => {
    const tools = parseTools(rows);
    const byFlow = indexToolsByFlow(tools);
    expect(byFlow[FLOW_ID.toLowerCase()]).toHaveLength(2);
  });

  it("groups tools by agent", () => {
    const tools = parseTools(rows);
    const byAgent = toolsByAgent(tools);
    expect(byAgent["botA"]).toHaveLength(2);
    expect(byAgent["botB"]).toHaveLength(1);
  });

  it("returns no prompt index when there are no prompt refs", () => {
    const tools = parseTools(rows);
    expect(Object.keys(indexToolsByPrompt(tools))).toHaveLength(0);
  });
});

describe("connectorApiFromRef", () => {
  it("extracts the middle segment", () => {
    expect(connectorApiFromRef(CONN_REF)).toBe("shared_commondataserviceforapps");
  });
  it("returns the input when there is no dot segment", () => {
    expect(connectorApiFromRef("single")).toBe("single");
  });
});
