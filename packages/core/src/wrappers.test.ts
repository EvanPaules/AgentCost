import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTracker } from "./AgentCost.js";
import { wrapAnthropic, wrapOpenAI, wrapOllama } from "./wrappers.js";

async function collectStream<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("wrapAnthropic", () => {
  it("tracks streaming responses from final events", async () => {
    const tracker = createTracker();

    const client = wrapAnthropic(
      {
        messages: {
          async create() {
            return (async function* () {
              yield { type: "message_start", message: { model: "claude-sonnet-4-6" }, usage: { input_tokens: 100, output_tokens: 0 } };
              yield { type: "content_block_delta" };
              yield { type: "message_delta", delta: { usage: { output_tokens: 50 } } };
            })();
          },
        },
      },
      tracker,
    );

    const stream = await client.messages.create({ model: "claude-sonnet-4-6", stream: true });
    assert.equal(tracker.getReport().steps.length, 0);

    const chunks = await collectStream(stream as AsyncIterable<unknown>);
    assert.equal(chunks.length, 3);

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].model, "claude-sonnet-4-6");
    assert.equal(report.steps[0].inputTokens, 100);
    assert.equal(report.steps[0].outputTokens, 50);
  });
});

describe("wrapOpenAI", () => {
  it("tracks streaming responses from the final chunk", async () => {
    const tracker = createTracker();

    const client = wrapOpenAI(
      {
        chat: {
          completions: {
            async create() {
              return (async function* () {
                yield { model: "gpt-4o", usage: null };
                yield { model: "gpt-4o", usage: null };
                yield { model: "gpt-4o", usage: { prompt_tokens: 200, completion_tokens: 80 } };
              })();
            },
          },
        },
      },
      tracker,
    );

    const stream = await client.chat.completions.create({ model: "gpt-4o", stream: true });
    assert.equal(tracker.getReport().steps.length, 0);

    const chunks = await collectStream(stream as AsyncIterable<unknown>);
    assert.equal(chunks.length, 3);

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].model, "gpt-4o");
    assert.equal(report.steps[0].inputTokens, 200);
    assert.equal(report.steps[0].outputTokens, 80);
  });
});

describe("wrapOllama", () => {
  it("tracks non-streaming chat responses", async () => {
    const tracker = createTracker({
      customPricing: {
        "llama3.2": { inputPer1M: 1, outputPer1M: 2 },
      },
    });

    const client = wrapOllama(
      {
        async chat() {
          return {
            model: "llama3.2",
            prompt_eval_count: 1000,
            eval_count: 500,
            done: true,
          };
        },
        async generate() {
          throw new Error("not used");
        },
      },
      tracker,
    );

    await client.chat({ model: "llama3.2" });

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].model, "llama3.2");
    assert.equal(report.steps[0].inputTokens, 1000);
    assert.equal(report.steps[0].outputTokens, 500);
  });

  it("tracks streaming generate responses from the final chunk", async () => {
    const tracker = createTracker({
      customPricing: {
        "llama3.2": { inputPer1M: 1, outputPer1M: 2 },
      },
    });

    const client = wrapOllama(
      {
        async chat() {
          throw new Error("not used");
        },
        async generate() {
          return (async function* () {
            yield { model: "llama3.2", done: false };
            yield {
              model: "llama3.2",
              prompt_eval_count: 400,
              eval_count: 200,
              done: true,
            };
          })();
        },
      },
      tracker,
    );

    const stream = await client.generate({ model: "llama3.2", stream: true });
    assert.equal(tracker.getReport().steps.length, 0);

    const chunks = await collectStream(stream as AsyncIterable<unknown>);
    assert.equal(chunks.length, 2);

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].inputTokens, 400);
    assert.equal(report.steps[0].outputTokens, 200);
  });

  it("tracks embed responses as input-only usage", async () => {
    const tracker = createTracker({
      customPricing: {
        "nomic-embed-text": { inputPer1M: 0.5, outputPer1M: 0 },
      },
    });

    const client = wrapOllama(
      {
        async chat() {
          throw new Error("not used");
        },
        async generate() {
          throw new Error("not used");
        },
        async embed() {
          return {
            model: "nomic-embed-text",
            prompt_eval_count: 256,
          };
        },
      },
      tracker,
    );

    await client.embed!({ model: "nomic-embed-text", input: "hello" });

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].model, "nomic-embed-text");
    assert.equal(report.steps[0].inputTokens, 256);
    assert.equal(report.steps[0].outputTokens, 0);
  });
});
