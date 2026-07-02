import type { RunInfo, CostModel } from "./costEngine";
import { isFailedStep, runCredits } from "./costEngine";

export function shortDate(d: string): string {
  if (!d) return "(n/a)";
  const t = new Date(d);
  return isNaN(t.getTime()) ? d : t.toISOString().slice(0, 16).replace("T", " ");
}

export function money(credits: number, model: CostModel): string {
  if (model.pricePerCredit <= 0) return "—";
  return `${model.currency}${(credits * model.pricePerCredit).toFixed(2)}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Build a CSV (one row per transcript) for FinOps export. */
export function runsToCsv(runs: RunInfo[], model: CostModel): string {
  const header = ["Created", "Agent", "Schema", "CompletedSteps", "FailedSteps", "Credits", "Cost", "TranscriptId"];
  const rows = runs.map((r) => {
    const completed = r.steps.filter((s) => !isFailedStep(s)).length;
    const failed = r.steps.length - completed;
    const credits = runCredits(r);
    const cost = model.pricePerCredit > 0 ? (credits * model.pricePerCredit).toFixed(2) : "";
    return [
      shortDate(r.createdon),
      `"${r.agentLabel.replace(/"/g, '""')}"`,
      r.agentSchema,
      completed,
      failed,
      credits,
      cost,
      r.id,
    ].join(",");
  });
  return [header.join(","), ...rows].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
