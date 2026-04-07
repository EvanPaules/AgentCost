import type { Report, Step } from "./AgentCost.js";

export interface ModelBreakdown {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  percentOfTotal: number;
}

export interface DetailedReport extends Report {
  byModel: ModelBreakdown[];
  duration: { first: number; last: number; ms: number } | null;
}

/**
 * Takes a basic Report and enriches it with per-model breakdowns
 * and timing information.
 */
export function analyzeReport(report: Report): DetailedReport {
  const modelMap = new Map<string, Omit<ModelBreakdown, "percentOfTotal">>();

  for (const step of report.steps) {
    const existing = modelMap.get(step.model);
    if (existing) {
      existing.calls++;
      existing.inputTokens += step.inputTokens;
      existing.outputTokens += step.outputTokens;
      existing.cost += step.cost;
    } else {
      modelMap.set(step.model, {
        model: step.model,
        calls: 1,
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
        cost: step.cost,
      });
    }
  }

  const byModel: ModelBreakdown[] = [...modelMap.values()]
    .map((m) => ({
      ...m,
      percentOfTotal: report.totalCost > 0 ? (m.cost / report.totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost); // most expensive first

  let duration: DetailedReport["duration"] = null;
  if (report.steps.length > 0) {
    const timestamps = report.steps.map((s) => s.timestamp);
    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps);
    duration = { first, last, ms: last - first };
  }

  return {
    ...report,
    byModel,
    duration,
  };
}

/**
 * Formats a report as a human-readable summary string.
 */
export function formatReport(report: Report): string {
  const detailed = analyzeReport(report);
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════╗");
  lines.push("║              AgentCost Report                   ║");
  lines.push("╠══════════════════════════════════════════════════╣");
  lines.push(`║  Total Cost:          $${detailed.totalCost.toFixed(4).padStart(12)}`);
  lines.push(`║  Total Input Tokens:  ${detailed.totalInputTokens.toLocaleString().padStart(13)}`);
  lines.push(`║  Total Output Tokens: ${detailed.totalOutputTokens.toLocaleString().padStart(13)}`);
  lines.push(`║  API Calls:           ${detailed.steps.length.toString().padStart(13)}`);

  if (detailed.duration) {
    const secs = (detailed.duration.ms / 1000).toFixed(1);
    lines.push(`║  Duration:            ${(secs + "s").padStart(13)}`);
  }

  if (detailed.byModel.length > 0) {
    lines.push("╠══════════════════════════════════════════════════╣");
    lines.push("║  Breakdown by Model                              ");
    lines.push("╠──────────────────────────────────────────────────╣");

    for (const m of detailed.byModel) {
      lines.push(`║  ${m.model}`);
      lines.push(`║    Calls: ${m.calls}  |  Cost: $${m.cost.toFixed(4)}  (${m.percentOfTotal.toFixed(1)}%)`);
      lines.push(`║    Input: ${m.inputTokens.toLocaleString()}  |  Output: ${m.outputTokens.toLocaleString()}`);
    }
  }

  lines.push("╚══════════════════════════════════════════════════╝");
  return lines.join("\n");
}

/**
 * Filters steps by a metadata key/value match.
 */
export function filterSteps(
  steps: Step[],
  key: string,
  value: unknown,
): Step[] {
  return steps.filter((s) => s.meta?.[key] === value);
}

/**
 * Returns a JSON-serializable export of the detailed report.
 */
export function exportReport(report: Report): string {
  return JSON.stringify(analyzeReport(report), null, 2);
}
