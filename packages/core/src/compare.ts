import type { Report } from "./AgentCost.js";
import { MODEL_PRICING, type ModelPricing } from "./models.js";

export interface EquivalentCost {
  model: string;
  cost: number;
  delta: number;
  deltaPercent: number;
}

export interface ComparisonTable {
  actualModel: string | "mixed";
  actualCost: number;
  alternatives: EquivalentCost[];
}

const DEFAULT_ALTERNATIVES = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "deepseek-chat",
];

function priceFor(
  model: string,
  custom?: Record<string, ModelPricing>,
): ModelPricing | undefined {
  return custom?.[model] ?? MODEL_PRICING[model];
}

/**
 * What would this run have cost on a different model?
 * Re-prices the report's token totals against `targetModel`.
 */
export function equivalentCost(
  report: Report,
  targetModel: string,
  customPricing?: Record<string, ModelPricing>,
): number {
  const pricing = priceFor(targetModel, customPricing);
  if (!pricing) {
    throw new Error(`Unknown model: "${targetModel}". Provide pricing via customPricing.`);
  }
  return (
    (report.totalInputTokens / 1_000_000) * pricing.inputPer1M +
    (report.totalOutputTokens / 1_000_000) * pricing.outputPer1M
  );
}

/**
 * Build a side-by-side "what if we'd used X" table across popular models.
 * Great for README demos and "local model saved me $Y" screenshots.
 */
export function compareModels(
  report: Report,
  options: {
    models?: string[];
    customPricing?: Record<string, ModelPricing>;
  } = {},
): ComparisonTable {
  const models = options.models ?? DEFAULT_ALTERNATIVES;
  const actualCost = report.totalCost;

  const actualModels = new Set(report.steps.map((s) => s.model));
  const actualModel: string | "mixed" =
    actualModels.size === 1 ? [...actualModels][0]! : "mixed";

  const alternatives: EquivalentCost[] = models
    .filter((m) => priceFor(m, options.customPricing))
    .map((m) => {
      const cost = equivalentCost(report, m, options.customPricing);
      const delta = cost - actualCost;
      const deltaPercent = actualCost > 0 ? (delta / actualCost) * 100 : 0;
      return { model: m, cost, delta, deltaPercent };
    })
    .sort((a, b) => a.cost - b.cost);

  return { actualModel, actualCost, alternatives };
}

/**
 * Human-readable comparison table. Drop into logs, tweets, or screenshots.
 */
export function formatComparison(table: ComparisonTable): string {
  const lines: string[] = [];
  const actualLabel =
    table.actualModel === "mixed" ? "mixed models" : table.actualModel;
  lines.push(`Actual run (${actualLabel}): $${table.actualCost.toFixed(4)}`);
  lines.push("");
  lines.push("If you had used instead:");

  const nameWidth = Math.max(
    ...table.alternatives.map((a) => a.model.length),
    10,
  );

  for (const alt of table.alternatives) {
    const name = alt.model.padEnd(nameWidth);
    const cost = `$${alt.cost.toFixed(4)}`.padStart(10);
    const sign = alt.delta >= 0 ? "+" : "-";
    const deltaAbs = Math.abs(alt.delta).toFixed(4);
    const pct = alt.deltaPercent.toFixed(0);
    const deltaStr =
      table.actualCost > 0
        ? `  (${sign}$${deltaAbs}, ${alt.deltaPercent >= 0 ? "+" : ""}${pct}%)`
        : "";
    lines.push(`  ${name}  ${cost}${deltaStr}`);
  }

  return lines.join("\n");
}
