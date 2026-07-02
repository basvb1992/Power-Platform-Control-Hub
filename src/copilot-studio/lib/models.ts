/**
 * Model registry — maps a Copilot Studio agent's `modelNameHint` (read from the
 * agent's Custom GPT component `data`) to a friendly label and billing tier.
 *
 * Tiers follow Microsoft's licensing rules (Learn — "Change the model version and
 * settings" / "Billing rates and management"):
 *   - basic    → charged at the Basic rate (e.g. GPT-4.1 mini)
 *   - standard → charged at the Standard rate (GPT-4.1, GPT-5 chat, Claude Sonnet)
 *   - premium  → charged at the Premium rate; these are the reasoning-capable
 *                models (Azure OpenAI o3, GPT-5 reasoning, Claude Opus). Premium
 *                models also incur "Text & generative AI tools (premium)" token
 *                credits (10 cr / 1,000 tokens) on a separate meter.
 *
 * `reasoning: true` means the agent uses a deep-reasoning / premium model.
 */
export type ModelTier = "basic" | "standard" | "premium" | "unknown";

export interface ModelInfo {
  /** Raw modelNameHint from Dataverse (empty when unknown). */
  hint: string;
  /** Friendly display name. */
  label: string;
  tier: ModelTier;
  /** True for reasoning-capable / premium models (deep reasoning). */
  reasoning: boolean;
}

/** Normalize a hint for matching: lowercase, strip separators. */
function norm(hint: string): string {
  return String(hint || "").toLowerCase().replace(/[\s._-]/g, "");
}

interface Entry {
  test: (n: string) => boolean;
  label: string;
  tier: ModelTier;
  reasoning: boolean;
}

// Order matters: more specific patterns first (mini/reasoning before the base name).
const REGISTRY: Entry[] = [
  { test: (n) => n.includes("gpt5reasoning"), label: "GPT-5 reasoning", tier: "premium", reasoning: true },
  { test: (n) => n.includes("gpt5chat") || n === "gpt5", label: "GPT-5 chat", tier: "standard", reasoning: false },
  { test: (n) => n.includes("gpt41mini") || n.includes("gpt4omini"), label: "GPT-4.1 mini", tier: "basic", reasoning: false },
  { test: (n) => n.includes("gpt41") || n.includes("gpt4o") || n.includes("gpt4"), label: "GPT-4.1", tier: "standard", reasoning: false },
  { test: (n) => n === "o3" || n.includes("openaio3") || (n.includes("o3") && !n.includes("gpt")), label: "o3 (deep reasoning)", tier: "premium", reasoning: true },
  { test: (n) => n.includes("opus"), label: "Claude Opus 4.6", tier: "premium", reasoning: true },
  { test: (n) => n.includes("sonnet46") || n.includes("sonnet4dot6"), label: "Claude Sonnet 4.6", tier: "standard", reasoning: false },
  { test: (n) => n.includes("sonnet45") || n.includes("sonnet4dot5"), label: "Claude Sonnet 4.5", tier: "standard", reasoning: false },
  { test: (n) => n.includes("sonnet"), label: "Claude Sonnet", tier: "standard", reasoning: false },
  { test: (n) => n.includes("cua") || n.includes("computeruse"), label: "Computer-Using Agent", tier: "standard", reasoning: false },
];

/** Classify an agent's model from its `modelNameHint`. */
export function classifyModel(hint: string | undefined | null): ModelInfo {
  const raw = String(hint || "").trim();
  const n = norm(raw);
  if (!n) return { hint: "", label: "Default", tier: "unknown", reasoning: false };
  for (const e of REGISTRY) {
    if (e.test(n)) return { hint: raw, label: e.label, tier: e.tier, reasoning: e.reasoning };
  }
  return { hint: raw, label: raw, tier: "unknown", reasoning: false };
}

/** Pull the modelNameHint out of a Custom GPT component's `data` blob (YAML/JSON). */
export function extractModelHint(data: string | undefined | null): string {
  const m = String(data || "").match(/modelNameHint:\s*["']?([A-Za-z0-9._-]+)/i);
  return m ? m[1] : "";
}
