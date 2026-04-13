# AgentCost

Lightweight cost tracking and optimization for AI agent systems.

Know exactly what your LLM calls cost, find where you're overspending, and set budget guardrails  - all in a few lines of code.

## Features

- **Real-time cost tracking**  - log every LLM call with automatic price calculation
- **40+ models built-in**  - Anthropic, OpenAI, Google Gemini, Mistral, DeepSeek, Meta Llama, Cohere, Amazon Nova
- **Auto-instrumentation**  - monkey-patch `fetch` to track calls with zero code changes (supports JSON, SSE, and Ollama NDJSON streams)
- **SDK wrappers**  - wrap Anthropic, OpenAI, or Ollama clients directly for explicit tracking
- **Budget alerts**  - get notified when spend crosses a threshold
- **Rich reports**  - per-model breakdowns, percentage splits, formatted summaries, JSON export
- **Custom pricing**  - add any model not in the built-in list
- **Cross-model cost comparison**  - see what any run would have cost on GPT-4, Claude, Gemini, DeepSeek, and more

## Install

```bash
npm install agentcost
```

## Quick Start

### Manual tracking

```ts
import { createTracker, formatReport } from "agentcost";

const tracker = createTracker({ budgetLimit: 5.0, onBudgetAlert: (r) => console.warn("Budget exceeded!", r.totalCost) });

// After each LLM call, log the usage:
tracker.track("gpt-4o", inputTokens, outputTokens);
tracker.track("claude-sonnet-4-6", inputTokens, outputTokens);

// Get a formatted summary
console.log(formatReport(tracker.getReport()));
```

### Auto-instrumentation (fetch proxy)

```ts
import { createTracker, initProxy, formatReport } from "agentcost";

const tracker = createTracker();
const teardown = initProxy(tracker);

// Now any fetch() call to Anthropic, OpenAI, or Ollama's official
// local/cloud endpoints is tracked automatically, including streaming responses.
const res = await fetch("https://api.openai.com/v1/chat/completions", { ... });

console.log(formatReport(tracker.getReport()));
teardown(); // restore original fetch when done
```

> **Note:** Use either `initProxy()` or an SDK wrapper (`wrapAnthropic`, `wrapOpenAI`, `wrapOllama`) -- not both at the same time. Combining them will double-count every call.

### SDK wrappers

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createTracker, wrapAnthropic, formatReport } from "agentcost";

const tracker = createTracker();
const client = wrapAnthropic(new Anthropic(), tracker);

const msg = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(formatReport(tracker.getReport()));
```

```ts
import OpenAI from "openai";
import { createTracker, wrapOpenAI, formatReport } from "agentcost";

const tracker = createTracker();
const client = wrapOpenAI(new OpenAI(), tracker);

const res = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(formatReport(tracker.getReport()));
```

```ts
import ollama from "ollama";
import { createTracker, wrapOllama, formatReport } from "agentcost";

const tracker = createTracker({
  customPricing: {
    "llama3.2": { inputPer1M: 0, outputPer1M: 0 },
  },
});
const client = wrapOllama(ollama, tracker);

await client.chat({
  model: "llama3.2",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(formatReport(tracker.getReport()));
```

### Per-agent tagging

Use the `meta` parameter to tag calls by agent, task, or anything else:

```ts
tracker.track("gpt-4o", inputTokens, outputTokens, { agent: "planner" });
tracker.track("claude-sonnet-4-6", inputTokens, outputTokens, { agent: "coder" });

// Filter report by agent
import { filterSteps, analyzeReport } from "agentcost";

const plannerSteps = filterSteps(tracker.getReport().steps, "agent", "planner");
```

### Detailed report

```ts
import { analyzeReport } from "agentcost";

const detailed = analyzeReport(tracker.getReport());

for (const m of detailed.byModel) {
  console.log(`${m.model}: $${m.cost.toFixed(4)} (${m.percentOfTotal.toFixed(1)}%)  - ${m.calls} calls`);
}
```

### Compare what your run would have cost on another model

Ever wondered how much that GPT-4o run would have cost on Claude Haiku - or how much you saved by running Ollama locally? One call answers both:

```ts
import { compareModels, formatComparison } from "agentcost";

console.log(formatComparison(compareModels(tracker.getReport())));
```

```
Actual run (gpt-4o): $12.5000

If you had used instead:
  gemini-2.5-flash             $0.7500  (-$11.7500, -94%)
  gpt-4o-mini                  $0.7500  (-$11.7500, -94%)
  claude-haiku-4-5-20251001    $4.8000  (-$7.7000, -62%)
  deepseek-chat                $1.3700  (-$11.1300, -89%)
  gemini-2.5-pro               $11.2500 (-$1.2500, -10%)
  claude-sonnet-4-6            $18.0000 (+$5.5000, +44%)
  gpt-4o                       $12.5000 (+$0.0000, +0%)
  claude-opus-4-6              $90.0000 (+$77.5000, +620%)
```

Pick your own shortlist or price against a single model:

```ts
import { compareModels, equivalentCost } from "agentcost";

compareModels(report, { models: ["gpt-4o-mini", "claude-haiku-4-5-20251001"] });
equivalentCost(report, "claude-sonnet-4-6"); // just the dollar figure
```

Pairs perfectly with `wrapOllama` - track a local run, then see what it would have cost on a cloud provider.

### Custom pricing

```ts
const tracker = createTracker({
  customPricing: {
    "my-fine-tuned-model": { inputPer1M: 5, outputPer1M: 15 },
  },
});
```

## Supported Models

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5, 3.5 Sonnet, 3.5 Haiku, 3 Opus, 3 Sonnet, 3 Haiku |
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo, o1, o1-mini, o3, o3-mini, o4-mini |
| Google | Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash, 1.5 Pro, 1.5 Flash |
| Mistral | Large, Medium, Small, Codestral |
| DeepSeek | Chat, Reasoner |
| Meta Llama | Llama 4 Maverick, Scout; Llama 3.1 405B, 70B, 8B (via Together/Fireworks) |
| Cohere | Command R+, Command R |
| Amazon | Nova Pro, Lite, Micro |
| Ollama | Any Ollama model via `customPricing` |

## API

### `createTracker(options?)`

Creates a new `AgentCost` instance.

| Option | Type | Description |
|--------|------|-------------|
| `budgetLimit` | `number` | Dollar amount that triggers the alert |
| `onBudgetAlert` | `(report) => void` | Called once when total cost >= budgetLimit |
| `customPricing` | `Record<string, ModelPricing>` | Additional or override model pricing |

### `tracker.track(model, inputTokens, outputTokens, meta?)`

Records a single LLM call. Returns the `Step` with calculated cost.

### `tracker.getReport()`

Returns a `Report` with `steps`, `totalInputTokens`, `totalOutputTokens`, `totalCost`.

### `tracker.reset()`

Clears all steps and resets the budget alert.

### `initProxy(tracker)`

Patches `globalThis.fetch` to auto-track Anthropic, OpenAI, and Ollama API calls. Supports JSON, SSE, and Ollama NDJSON streaming. Returns a teardown function.

### `wrapAnthropic(client, tracker)` / `wrapOpenAI(client, tracker)` / `wrapOllama(client, tracker)`

Wraps an SDK client to auto-track every API call. Ollama integrations typically need `customPricing` because local model names are not part of the built-in pricing table.

### `analyzeReport(report)` / `formatReport(report)` / `exportReport(report)`

Enrich, format, or serialize a report.

### `compareModels(report, options?)` / `equivalentCost(report, model)` / `formatComparison(table)`

Re-price a report against other models. `compareModels` returns a ranked table with per-model dollar and percent deltas; `equivalentCost` returns a single number; `formatComparison` renders the table as a human-readable string. Pass `{ models: [...] }` to override the default shortlist or `{ customPricing }` to price against unlisted models.

### `filterSteps(steps, key, value)`

Filter steps by a metadata key/value pair.

## License

MIT
