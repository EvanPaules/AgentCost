import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createTracker,
  formatReport,
  analyzeReport,
  exportReport,
  MODEL_PRICING,
  type TrackerOptions,
} from "agentcost";

export interface McpServerOptions {
  /** Dollar amount that triggers a budget warning in responses. */
  budgetLimit?: number;
  /** Custom model pricing to merge with built-in pricing. */
  customPricing?: TrackerOptions["customPricing"];
}

export function createMcpServer(options: McpServerOptions = {}) {
  const tracker = createTracker({
    budgetLimit: options.budgetLimit,
    customPricing: options.customPricing,
  });

  const server = new McpServer({
    name: "agentcost",
    version: "0.1.0",
  });

  // ── track_cost ─────────────────────────────────────────────
  server.tool(
    "track_cost",
    "Record an LLM API call and its token usage. Returns the cost for that call and the running total.",
    {
      model: z.string().describe("Model identifier, e.g. 'gpt-4o' or 'claude-sonnet-4-6'"),
      input_tokens: z.number().int().min(0).describe("Number of input/prompt tokens"),
      output_tokens: z.number().int().min(0).describe("Number of output/completion tokens"),
      agent: z.string().optional().describe("Optional agent or task name for tagging"),
      label: z.string().optional().describe("Optional label for this call"),
    },
    async ({ model, input_tokens, output_tokens, agent, label }) => {
      const meta: Record<string, unknown> = {};
      if (agent) meta.agent = agent;
      if (label) meta.label = label;

      try {
        const step = tracker.track(model, input_tokens, output_tokens, Object.keys(meta).length > 0 ? meta : undefined);
        const report = tracker.getReport();

        const budgetInfo = options.budgetLimit != null
          ? `\nBudget: $${report.totalCost.toFixed(4)} / $${options.budgetLimit.toFixed(2)} (${((report.totalCost / options.budgetLimit) * 100).toFixed(1)}% used)`
          : "";

        return {
          content: [{
            type: "text" as const,
            text: `Tracked: ${model}\n` +
              `  This call: $${step.cost.toFixed(6)} (${input_tokens.toLocaleString()} in / ${output_tokens.toLocaleString()} out)\n` +
              `  Running total: $${report.totalCost.toFixed(4)} across ${report.steps.length} calls` +
              budgetInfo,
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // ── get_report ─────────────────────────────────────────────
  server.tool(
    "get_report",
    "Get a formatted cost report showing total spend, per-model breakdowns, and call counts.",
    {
      format: z.enum(["text", "json"]).default("text").describe("Output format: 'text' for human-readable, 'json' for structured data"),
    },
    async ({ format }) => {
      const report = tracker.getReport();

      if (report.steps.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No API calls tracked yet." }],
        };
      }

      const text = format === "json"
        ? exportReport(report)
        : formatReport(report);

      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );

  // ── get_budget_status ──────────────────────────────────────
  server.tool(
    "get_budget_status",
    "Check current spend against the configured budget limit. Shows remaining budget and usage percentage.",
    {},
    async () => {
      const report = tracker.getReport();
      const total = report.totalCost;
      const calls = report.steps.length;

      if (options.budgetLimit == null) {
        return {
          content: [{
            type: "text" as const,
            text: `Total spend: $${total.toFixed(4)} across ${calls} calls.\nNo budget limit configured.`,
          }],
        };
      }

      const remaining = Math.max(0, options.budgetLimit - total);
      const pct = (total / options.budgetLimit) * 100;
      const exceeded = total >= options.budgetLimit;

      let status: string;
      if (exceeded) {
        status = `BUDGET EXCEEDED`;
      } else if (pct >= 80) {
        status = `WARNING: approaching limit`;
      } else {
        status = `OK`;
      }

      return {
        content: [{
          type: "text" as const,
          text: `Budget Status: ${status}\n` +
            `  Spent:     $${total.toFixed(4)}\n` +
            `  Limit:     $${options.budgetLimit.toFixed(2)}\n` +
            `  Remaining: $${remaining.toFixed(4)}\n` +
            `  Usage:     ${pct.toFixed(1)}%\n` +
            `  Calls:     ${calls}`,
        }],
      };
    },
  );

  // ── estimate_cost ──────────────────────────────────────────
  server.tool(
    "estimate_cost",
    "Estimate the cost of an LLM call before making it. Useful for deciding which model to use.",
    {
      model: z.string().describe("Model identifier"),
      input_tokens: z.number().int().min(0).describe("Estimated input tokens"),
      output_tokens: z.number().int().min(0).describe("Estimated output tokens"),
    },
    async ({ model, input_tokens, output_tokens }) => {
      const allPricing = { ...MODEL_PRICING, ...options.customPricing };
      const pricing = allPricing[model];

      if (!pricing) {
        // Show similar models as suggestions
        const available = Object.keys(allPricing)
          .filter((m) => m.toLowerCase().includes(model.toLowerCase().split("-")[0]))
          .slice(0, 5);

        return {
          content: [{
            type: "text" as const,
            text: `Unknown model: "${model}".` +
              (available.length > 0 ? `\nDid you mean: ${available.join(", ")}?` : "") +
              `\nUse list_models to see all supported models.`,
          }],
          isError: true,
        };
      }

      const inputCost = (input_tokens / 1_000_000) * pricing.inputPer1M;
      const outputCost = (output_tokens / 1_000_000) * pricing.outputPer1M;
      const totalCost = inputCost + outputCost;

      let budgetNote = "";
      if (options.budgetLimit != null) {
        const currentTotal = tracker.getReport().totalCost;
        const afterCall = currentTotal + totalCost;
        if (afterCall >= options.budgetLimit) {
          budgetNote = `\n\nWARNING: This call would push total spend to $${afterCall.toFixed(4)}, exceeding the $${options.budgetLimit.toFixed(2)} budget limit.`;
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: `Cost estimate for ${model}:\n` +
            `  Input:  ${input_tokens.toLocaleString()} tokens  = $${inputCost.toFixed(6)}\n` +
            `  Output: ${output_tokens.toLocaleString()} tokens = $${outputCost.toFixed(6)}\n` +
            `  Total:  $${totalCost.toFixed(6)}` +
            budgetNote,
        }],
      };
    },
  );

  // ── list_models ────────────────────────────────────────────
  server.tool(
    "list_models",
    "List all supported models with their pricing. Optionally filter by provider name.",
    {
      filter: z.string().optional().describe("Filter models by name (case-insensitive substring match)"),
    },
    async ({ filter }) => {
      const allPricing = { ...MODEL_PRICING, ...options.customPricing };
      let entries = Object.entries(allPricing);

      if (filter) {
        const lower = filter.toLowerCase();
        entries = entries.filter(([name]) => name.toLowerCase().includes(lower));
      }

      if (entries.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: filter
              ? `No models matching "${filter}". Use list_models without a filter to see all.`
              : "No models configured.",
          }],
        };
      }

      const lines = entries.map(
        ([name, p]) => `${name.padEnd(55)} $${p.inputPer1M.toString().padStart(6)}/M in   $${p.outputPer1M.toString().padStart(6)}/M out`,
      );

      return {
        content: [{
          type: "text" as const,
          text: `Supported models (${entries.length}):\n\n` + lines.join("\n"),
        }],
      };
    },
  );

  // ── reset_tracker ──────────────────────────────────────────
  server.tool(
    "reset_tracker",
    "Clear all tracked cost data and reset the budget alert. Use this to start a fresh tracking session.",
    {},
    async () => {
      const report = tracker.getReport();
      const prevCalls = report.steps.length;
      const prevCost = report.totalCost;

      tracker.reset();

      return {
        content: [{
          type: "text" as const,
          text: `Tracker reset. Cleared ${prevCalls} calls totaling $${prevCost.toFixed(4)}.`,
        }],
      };
    },
  );

  return { server, tracker };
}
