# AgentCost

Lightweight cost tracking and optimization for AI agent systems.

Know exactly what your LLM calls cost, find where you're overspending, and set budget guardrails — all in a few lines of code.

## Features

- **Real-time cost tracking** — log every LLM call with automatic price calculation
- **40+ models built-in** — Anthropic, OpenAI, Google Gemini, Mistral, DeepSeek, Meta Llama, Cohere, Amazon Nova
- **Auto-instrumentation** — monkey-patch `fetch` to track calls with zero code changes (supports both JSON and streaming/SSE responses)
- **SDK wrappers** — wrap the Anthropic or OpenAI client directly for explicit tracking
- **Budget alerts** — get notified when spend crosses a threshold
- **Rich reports** — per-model breakdowns, percentage splits, formatted summaries, JSON export
- **Custom pricing** — add any model not in the built-in list

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

// Now any fetch() call to api.anthropic.com or api.openai.com is tracked
// automatically — including streaming responses.
const res = await fetch("https://api.openai.com/v1/chat/completions", { ... });

console.log(formatReport(tracker.getReport()));
teardown(); // restore original fetch when done
```

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
  console.log(`${m.model}: $${m.cost.toFixed(4)} (${m.percentOfTotal.toFixed(1)}%) — ${m.calls} calls`);
}
```

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

Patches `globalThis.fetch` to auto-track Anthropic and OpenAI API calls (JSON + streaming). Returns a teardown function.

### `wrapAnthropic(client, tracker)` / `wrapOpenAI(client, tracker)`

Wraps an SDK client to auto-track every API call.

### `analyzeReport(report)` / `formatReport(report)` / `exportReport(report)`

Enrich, format, or serialize a report.

### `filterSteps(steps, key, value)`

Filter steps by a metadata key/value pair.

## License

MIT
