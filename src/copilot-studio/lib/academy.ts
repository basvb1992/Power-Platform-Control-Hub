/**
 * Copilot Studio Agent Academy — in-app knowledge base.
 *
 * A static, versioned index of the free, open-source Microsoft training program
 * at https://microsoft.github.io/agent-academy/ (MIT / CC-licensed, maintained by
 * Microsoft). We keep it in-app (not in Dataverse) because it is read-only
 * reference content: it ships with the build, needs no per-tenant curation, and
 * must render instantly without extra Dataverse round-trips.
 *
 * Two layers live here:
 *   1. ACADEMY  — the grounded module/lab index (real titles + real URLs).
 *   2. BEST_PRACTICES — guidance entries tied to `SignalKey`s the hub already
 *      detects (governance findings, agent kind, cost, latency). When a signal
 *      is present in the loaded fleet we deep-link the user to the exact module
 *      that teaches the fix.
 *
 * All URLs are copied verbatim from the published site — none are synthesised.
 */

import type { AgentInventoryItem } from "./data";
import type { RunInfo } from "./costEngine";
import { SLOW_TURN_MS } from "./latency";

export type AcademyTrack = "Recruit" | "Operative" | "Special Ops" | "Cowork Collective";

export interface AcademyModule {
  /** Stable key used by best practices to reference a module. */
  id: string;
  track: AcademyTrack;
  /** Lesson number within its track ("00".."13"), or "" for standalone labs. */
  code: string;
  title: string;
  /** Canonical published URL (verbatim from microsoft.github.io/agent-academy). */
  url: string;
  summary: string;
  tags: string[];
}

const BASE = "https://microsoft.github.io/agent-academy";

export const ACADEMY_HOME = `${BASE}/`;

/**
 * The four published tracks, with a one-line description and their landing page.
 * Kept alongside ACADEMY so the browse UI can group and link to each track head.
 */
export const ACADEMY_TRACKS: { track: AcademyTrack; url: string; blurb: string }[] = [
  {
    track: "Recruit",
    url: `${BASE}/recruit/`,
    blurb:
      "Entry-level rank. Zero-to-first-agent: fundamentals, declarative & custom agents, topics, adaptive cards, agent flows, publishing and licensing.",
  },
  {
    track: "Operative",
    url: `${BASE}/operative/`,
    blurb:
      "Advanced rank. Enterprise multi-agent systems: orchestration, agent instructions, model selection, AI safety, multi-modal prompts, Dataverse grounding and MCP.",
  },
  {
    track: "Special Ops",
    url: `${BASE}/special-ops/`,
    blurb:
      "Standalone one-off labs on a single topic or integration (MCP, YAML, PAC CLI). No rank required — tackle in any order.",
  },
  {
    track: "Cowork Collective",
    url: `${BASE}/cowork-collective/`,
    blurb:
      "Hands-on labs for Copilot Cowork in Microsoft 365 Copilot (Frontier preview) — delegating multi-step work across your M365 environment.",
  },
];

/** The full module / lab index. */
export const ACADEMY: AcademyModule[] = [
  // ── Recruit ──────────────────────────────────────────────────────────────
  {
    id: "recruit-00",
    track: "Recruit",
    code: "00",
    title: "Course Setup",
    url: `${BASE}/recruit/00-course-setup/`,
    summary: "Set up your dev environment, Copilot Studio trial, and SharePoint site.",
    tags: ["setup", "trial", "environment"],
  },
  {
    id: "recruit-01",
    track: "Recruit",
    code: "01",
    title: "Introduction to Agents",
    url: `${BASE}/recruit/01-introduction-to-agents/`,
    summary: "Conversational AI concepts, LLMs, and autonomous vs. declarative agents.",
    tags: ["concepts", "llm", "declarative", "autonomous"],
  },
  {
    id: "recruit-02",
    track: "Recruit",
    code: "02",
    title: "Copilot Studio Fundamentals",
    url: `${BASE}/recruit/02-copilot-studio-fundamentals/`,
    summary: "The building blocks: knowledge, skills, autonomy.",
    tags: ["fundamentals", "knowledge", "authoring"],
  },
  {
    id: "recruit-03",
    track: "Recruit",
    code: "03",
    title: "Create a Declarative Agent for M365 Copilot",
    url: `${BASE}/recruit/03-create-a-declarative-agent-for-M365Copilot/`,
    summary: "Add your own agent to Microsoft 365 Copilot, grounded in a prompt.",
    tags: ["declarative", "m365", "grounding"],
  },
  {
    id: "recruit-04",
    track: "Recruit",
    code: "04",
    title: "Creating a Solution",
    url: `${BASE}/recruit/04-creating-a-solution/`,
    summary: "Package your agent into a reusable solution for environment management (ALM).",
    tags: ["alm", "solution", "ownership", "governance"],
  },
  {
    id: "recruit-05",
    track: "Recruit",
    code: "05",
    title: "Get Started with Pre-Built Agents",
    url: `${BASE}/recruit/05-using-prebuilt-agents/`,
    summary: "Use and customize a template agent to accelerate setup.",
    tags: ["templates", "prebuilt"],
  },
  {
    id: "recruit-06",
    track: "Recruit",
    code: "06",
    title: "Build a Custom Agent",
    url: `${BASE}/recruit/06-create-agent-from-conversation/`,
    summary: "Create a new agent grounded in knowledge sources.",
    tags: ["custom", "knowledge", "grounding"],
  },
  {
    id: "recruit-07",
    track: "Recruit",
    code: "07",
    title: "Add a Topic with Triggers",
    url: `${BASE}/recruit/07-add-new-topic-with-trigger/`,
    summary: "Use Topics to define custom question/answer paths.",
    tags: ["topics", "triggers", "classic"],
  },
  {
    id: "recruit-08",
    track: "Recruit",
    code: "08",
    title: "Enhance with Adaptive Cards",
    url: `${BASE}/recruit/08-add-adaptive-card/`,
    summary: "Build an Adaptive Card using Power Fx and SharePoint.",
    tags: ["adaptive-cards", "power-fx", "ux"],
  },
  {
    id: "recruit-09",
    track: "Recruit",
    code: "09",
    title: "Automate with Agent Flows",
    url: `${BASE}/recruit/09-add-an-agent-flow/`,
    summary: "Use Adaptive Card input to trigger back-end flows.",
    tags: ["agent-flows", "automation", "power-automate"],
  },
  {
    id: "recruit-10",
    track: "Recruit",
    code: "10",
    title: "Add Event Triggers",
    url: `${BASE}/recruit/10-add-event-triggers/`,
    summary: "Enable your agent to act autonomously using event-based logic.",
    tags: ["triggers", "autonomous", "events"],
  },
  {
    id: "recruit-11",
    track: "Recruit",
    code: "11",
    title: "Publish Your Agent",
    url: `${BASE}/recruit/11-publish-your-agent/`,
    summary: "Deploy your agent to Microsoft Teams and Microsoft 365 Copilot.",
    tags: ["publish", "deploy", "channels"],
  },
  {
    id: "recruit-12",
    track: "Recruit",
    code: "12",
    title: "Understanding Licensing",
    url: `${BASE}/recruit/12-understanding-licensing/`,
    summary: "How licensing and billing works with Copilot Studio (messages / credits).",
    tags: ["licensing", "billing", "cost", "credits"],
  },
  {
    id: "recruit-13",
    track: "Recruit",
    code: "13",
    title: "Securing Your Recruit Badge",
    url: `${BASE}/recruit/course-completion-badges-recruit/`,
    summary: "Claim your badge and mark your achievement.",
    tags: ["badge"],
  },

  // ── Operative ────────────────────────────────────────────────────────────
  {
    id: "operative-01",
    track: "Operative",
    code: "01",
    title: "Get Started with the Hiring Agent",
    url: `${BASE}/operative/01-get-started/`,
    summary: "Deploy foundational infrastructure and create your central orchestrator agent.",
    tags: ["orchestration", "setup", "multi-agent"],
  },
  {
    id: "operative-02",
    track: "Operative",
    code: "02",
    title: "Authoring Agent Instructions",
    url: `${BASE}/operative/02-agent-instructions/`,
    summary: "Master precise agent communication and behaviour control.",
    tags: ["instructions", "prompting", "reliability"],
  },
  {
    id: "operative-03",
    track: "Operative",
    code: "03",
    title: "Make Your Agent Multi-Agent Ready (Connected Agents)",
    url: `${BASE}/operative/03-multi-agent/`,
    summary: "Transform a single agent into a coordinated multi-agent system.",
    tags: ["multi-agent", "connected-agents", "orchestration"],
  },
  {
    id: "operative-04",
    track: "Operative",
    code: "04",
    title: "Automate Your Agent with Triggers",
    url: `${BASE}/operative/04-automate-triggers/`,
    summary: "Implement autonomous agent behaviours with event-driven triggers.",
    tags: ["triggers", "autonomous", "events"],
  },
  {
    id: "operative-05",
    track: "Operative",
    code: "05",
    title: "Understanding Agent Models and Response Formatting",
    url: `${BASE}/operative/05-model-selection/`,
    summary: "Customize agent models for maximum impact — and control cost/latency.",
    tags: ["models", "model-selection", "cost", "latency", "formatting"],
  },
  {
    id: "operative-06",
    track: "Operative",
    code: "06",
    title: "Content Moderation and AI Safety Essentials",
    url: `${BASE}/operative/06-ai-safety/`,
    summary: "Implement enterprise-grade safety, moderation and compliance measures.",
    tags: ["ai-safety", "moderation", "governance", "compliance", "security"],
  },
  {
    id: "operative-07",
    track: "Operative",
    code: "07",
    title: "Extracting Resume Contents with Multi-Modal Prompts",
    url: `${BASE}/operative/07-multimodal-prompts/`,
    summary: "Process documents and images with advanced multi-modal AI capabilities.",
    tags: ["prompts", "multimodal", "documents"],
  },
  {
    id: "operative-08",
    track: "Operative",
    code: "08",
    title: "Prompts — Dataverse Grounding",
    url: `${BASE}/operative/08-dataverse-grounding/`,
    summary: "Ground agents in enterprise data for accurate responses.",
    tags: ["prompts", "dataverse", "grounding", "knowledge"],
  },
  {
    id: "operative-09",
    track: "Operative",
    code: "09",
    title: "Generating an Interview Prep Document",
    url: `${BASE}/operative/09-document-generation/`,
    summary: "Implement document generation inside AI prompts.",
    tags: ["prompts", "document-generation"],
  },
  {
    id: "operative-10",
    track: "Operative",
    code: "10",
    title: "Integrate with MCP Servers",
    url: `${BASE}/operative/10-mcp/`,
    summary: "Integrate with out-of-the-box Model Context Protocol (MCP) servers.",
    tags: ["mcp", "integration", "tools"],
  },
  {
    id: "operative-11",
    track: "Operative",
    code: "11",
    title: "Obtain User Feedback with Adaptive Cards",
    url: `${BASE}/operative/11-obtain-user-feedback/`,
    summary: "Collect and process user feedback for continuous improvement.",
    tags: ["adaptive-cards", "feedback", "adoption"],
  },
  {
    id: "operative-12",
    track: "Operative",
    code: "12",
    title: "Course Completion Badges",
    url: `${BASE}/operative/course-completion-badges-operative/`,
    summary: "Claim your Operative badge and celebrate your achievement.",
    tags: ["badge"],
  },

  // ── Special Ops (standalone labs) ────────────────────────────────────────
  {
    id: "specialops-mcs-mcp",
    track: "Special Ops",
    code: "",
    title: "Microsoft Copilot Studio ❤️ MCP",
    url: `${BASE}/special-ops/mcs-mcp/`,
    summary: "Connect Copilot Studio to a Model Context Protocol server.",
    tags: ["mcp", "integration", "tools"],
  },
  {
    id: "specialops-mslearn-mcp",
    track: "Special Ops",
    code: "",
    title: "Microsoft Learn MCP Server",
    url: `${BASE}/special-ops/ms-learn-mcp/`,
    summary: "Ground an agent in Microsoft Learn documentation via the Learn MCP server.",
    tags: ["mcp", "knowledge", "grounding"],
  },
  {
    id: "specialops-pac-cli-mcp",
    track: "Special Ops",
    code: "",
    title: "Power Platform CLI MCP",
    url: `${BASE}/special-ops/pac-cli-mcp/`,
    summary: "Drive the Power Platform CLI through an MCP server.",
    tags: ["mcp", "pac-cli", "alm"],
  },
  {
    id: "specialops-yaml",
    track: "Special Ops",
    code: "",
    title: "YAML Specialist",
    url: `${BASE}/special-ops/yaml-specialist/`,
    summary: "Author and understand the underlying agent YAML (BotDefinition).",
    tags: ["yaml", "authoring", "advanced"],
  },
  {
    id: "specialops-docusign-mcp",
    track: "Special Ops",
    code: "",
    title: "Microsoft Copilot Studio + Docusign MCP",
    url: `${BASE}/special-ops/docusign-mcp/`,
    summary: "Integrate Copilot Studio with the Docusign MCP server.",
    tags: ["mcp", "integration", "docusign"],
  },

  // ── Cowork Collective ────────────────────────────────────────────────────
  {
    id: "cowork-badge-check",
    track: "Cowork Collective",
    code: "",
    title: "Badge Check",
    url: `${BASE}/cowork-collective/badge-check/`,
    summary: "Confirm your access and set up for Copilot Cowork labs.",
    tags: ["cowork", "setup"],
  },
  {
    id: "cowork-compliance-packet",
    track: "Cowork Collective",
    code: "",
    title: "The Compliance Packet",
    url: `${BASE}/cowork-collective/compliance-packet/`,
    summary: "Use Copilot Cowork to assemble a compliance packet across M365.",
    tags: ["cowork", "compliance", "automation"],
  },
  {
    id: "cowork-out-of-office",
    track: "Cowork Collective",
    code: "",
    title: "Out of Office Vacation Handoff",
    url: `${BASE}/cowork-collective/out-of-office-prep/`,
    summary: "Delegate a vacation handoff to Copilot Cowork across your M365 environment.",
    tags: ["cowork", "automation", "productivity"],
  },
];

/** Look up modules by id, preserving the given order and skipping unknowns. */
export function modulesById(ids: string[]): AcademyModule[] {
  return ids
    .map((id) => ACADEMY.find((m) => m.id === id))
    .filter((m): m is AcademyModule => Boolean(m));
}

/** All modules for one track. */
export function modulesForTrack(track: AcademyTrack): AcademyModule[] {
  return ACADEMY.filter((m) => m.track === track);
}

/**
 * A condition the hub can detect in the loaded data. These map 1:1 to the
 * signals the analytics already compute (governance findings, agent kind,
 * cost/latency) so best practices can be surfaced exactly when they apply.
 */
export type SignalKey =
  | "orphaned"
  | "unpublished"
  | "stale"
  | "inactive"
  | "no-auth"
  | "high-failure"
  | "premium-connector"
  | "classic-agent"
  | "high-cost"
  | "slow-latency"
  | "uses-mcp";

export interface BestPractice {
  id: string;
  /** Grouping used in the Best Practices UI. */
  category: "Governance" | "Reliability" | "Cost" | "Design" | "Integration";
  title: string;
  /** The actionable guidance, one or two sentences. */
  tip: string;
  /** Detected conditions this practice addresses. */
  signals: SignalKey[];
  /** Academy modules that teach it (first = primary click-through). */
  moduleIds: string[];
}

/**
 * The curated best-practice catalogue. Each entry distils guidance from the
 * Academy and links back to the module(s) that teach it. `signals` is what ties
 * a practice to a live problem in the loaded environment.
 */
export const BEST_PRACTICES: BestPractice[] = [
  {
    id: "bp-ownership",
    category: "Governance",
    title: "Give every agent a clear owner and ship it in a solution",
    tip: "Orphaned agents have nobody accountable and drift out of ALM. Package agents into a solution so ownership, environments and lifecycle are explicit.",
    signals: ["orphaned"],
    moduleIds: ["recruit-04"],
  },
  {
    id: "bp-publish",
    category: "Governance",
    title: "Publish agents and keep them current",
    tip: "Unpublished or stale agents mean users hit old behaviour — or nothing at all. Publish to Teams / M365 Copilot and re-publish after changes.",
    signals: ["unpublished", "stale"],
    moduleIds: ["recruit-11"],
  },
  {
    id: "bp-adoption",
    category: "Design",
    title: "Drive adoption of live agents",
    tip: "A published agent with no conversations is wasted spend. Instrument feedback with Adaptive Cards and iterate on what users actually ask.",
    signals: ["inactive"],
    moduleIds: ["operative-11", "recruit-11"],
  },
  {
    id: "bp-auth",
    category: "Governance",
    title: "Configure authentication and AI safety",
    tip: "An agent with no end-user authentication can leak data or be abused. Set authentication and enable content moderation / safety controls.",
    signals: ["no-auth"],
    moduleIds: ["operative-06"],
  },
  {
    id: "bp-reliability",
    category: "Reliability",
    title: "Fix failing steps with better instructions and models",
    tip: "A high step-failure rate usually traces to ambiguous instructions or an under-powered model. Tighten agent instructions and review model selection.",
    signals: ["high-failure"],
    moduleIds: ["operative-02", "operative-05"],
  },
  {
    id: "bp-latency",
    category: "Reliability",
    title: "Tune models and orchestration for latency",
    tip: "Slow turns are dominated by model reasoning and tool/orchestration overhead. Right-size the model and simplify multi-agent hops for hot paths.",
    signals: ["slow-latency"],
    moduleIds: ["operative-05", "operative-03"],
  },
  {
    id: "bp-cost",
    category: "Cost",
    title: "Understand licensing and control credit spend",
    tip: "Model choice and per-turn design drive Copilot Studio credit consumption. Know how messages/credits are billed and pick models deliberately.",
    signals: ["high-cost", "premium-connector"],
    moduleIds: ["recruit-12", "operative-05"],
  },
  {
    id: "bp-modernize",
    category: "Design",
    title: "Modernise classic topic-based agents",
    tip: "Classic topic trees are harder to maintain than instruction-led generative agents. Consider grounding in knowledge and letting the model orchestrate.",
    signals: ["classic-agent"],
    moduleIds: ["recruit-06", "operative-02"],
  },
  {
    id: "bp-mcp",
    category: "Integration",
    title: "Integrate tools through MCP the supported way",
    tip: "When agents call external tools, prefer Model Context Protocol servers for a consistent, governable integration surface.",
    signals: ["uses-mcp"],
    moduleIds: ["operative-10", "specialops-mcs-mcp"],
  },
];

/**
 * Map a governance finding `category` (from governance.ts) to the hub signal it
 * represents, so the Governance panel can attach the right Academy links.
 * Returns null for categories with no dedicated best practice.
 */
export function signalForFindingCategory(category: string): SignalKey | null {
  switch (category) {
    case "Orphaned":
      return "orphaned";
    case "Unpublished":
      return "unpublished";
    case "Stale":
      return "stale";
    case "Inactive":
      return "inactive";
    case "No authentication":
      return "no-auth";
    case "High failure rate":
      return "high-failure";
    case "Premium connector":
      return "premium-connector";
    default:
      return null;
  }
}

/** Best practices addressing a given signal. */
export function bestPracticesForSignal(signal: SignalKey): BestPractice[] {
  return BEST_PRACTICES.filter((bp) => bp.signals.includes(signal));
}

/**
 * The primary Academy module to link for a governance finding category, plus the
 * best practice it belongs to. Used to render an inline "Learn how →" link.
 */
export function academyLinkForFindingCategory(
  category: string
): { practice: BestPractice; module: AcademyModule } | null {
  const signal = signalForFindingCategory(category);
  if (!signal) return null;
  const practice = bestPracticesForSignal(signal)[0];
  if (!practice) return null;
  const module = modulesById(practice.moduleIds)[0];
  if (!module) return null;
  return { practice, module };
}

/** Detected signals plus how many agents each one affects. */
export interface DetectedSignals {
  signals: Set<SignalKey>;
  counts: Partial<Record<SignalKey, number>>;
}

/** Average modeled credits per conversation above which an agent is "high-cost". */
export const HIGH_COST_CREDITS_PER_CONV = 15;

/** Total modeled credits for one run (sum of billable step costs). */
export function runCredits(run: RunInfo): number {
  return run.steps.reduce((s, st) => s + (st.cost || 0), 0);
}

/** True when a run's tool identifiers indicate a Model Context Protocol tool. */
export function runUsesMcp(run: RunInfo): boolean {
  return run.steps.some((st) => /\bmcp\b|modelcontextprotocol/i.test(st.tool || ""));
}

/** Stable per-agent key for grouping runs (schema first, else display label). */
function runAgentKey(run: RunInfo): string {
  return (run.agentSchema || run.agentLabel || "").toLowerCase();
}

/**
 * Detect the content/behaviour signals the analytics can infer directly from the
 * inventory and transcripts (everything except the governance-finding signals,
 * which the caller derives from buildGovernance). Counts are the number of
 * distinct agents each signal affects.
 *
 * Pure: no side effects, deterministic for given inputs, so it is unit-tested.
 */
export function detectContentSignals(
  items: AgentInventoryItem[],
  runs: RunInfo[]
): DetectedSignals {
  const signals = new Set<SignalKey>();
  const counts: Partial<Record<SignalKey, number>> = {};

  // classic-agent — from the inventory's authoring type.
  const classic = items.filter((i) => i.kind === "Classic").length;
  if (classic > 0) {
    signals.add("classic-agent");
    counts["classic-agent"] = classic;
  }

  // Group runs per agent for the transcript-derived signals.
  const byAgent = new Map<string, RunInfo[]>();
  for (const r of runs) {
    const key = runAgentKey(r);
    if (!key) continue;
    (byAgent.get(key) ?? byAgent.set(key, []).get(key)!).push(r);
  }

  let highCost = 0;
  let slow = 0;
  let mcp = 0;
  for (const group of byAgent.values()) {
    const avgCredits =
      group.reduce((s, r) => s + runCredits(r), 0) / Math.max(1, group.length);
    if (avgCredits >= HIGH_COST_CREDITS_PER_CONV) highCost++;
    if (group.some((r) => r.latency?.hasTiming && r.latency.totalMs >= SLOW_TURN_MS)) slow++;
    if (group.some(runUsesMcp)) mcp++;
  }
  if (highCost > 0) {
    signals.add("high-cost");
    counts["high-cost"] = highCost;
  }
  if (slow > 0) {
    signals.add("slow-latency");
    counts["slow-latency"] = slow;
  }
  if (mcp > 0) {
    signals.add("uses-mcp");
    counts["uses-mcp"] = mcp;
  }

  return { signals, counts };
}
