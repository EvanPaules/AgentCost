import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createTracker } from "./AgentCost.js";
import { initProxy } from "./proxy.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("initProxy", () => {
  it("tracks non-streaming Ollama responses", async () => {
    const tracker = createTracker({
      customPricing: {
        "llama3.2": { inputPer1M: 1, outputPer1M: 2 },
      },
    });

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          model: "llama3.2",
          prompt_eval_count: 1200,
          eval_count: 300,
          done: true,
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );

    const teardown = initProxy(tracker);
    await fetch("http://localhost:11434/api/chat", { method: "POST" });
    await setImmediate();
    teardown();

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].model, "llama3.2");
    assert.equal(report.steps[0].inputTokens, 1200);
    assert.equal(report.steps[0].outputTokens, 300);
  });

  it("tracks streaming Ollama responses from NDJSON", async () => {
    const tracker = createTracker({
      customPricing: {
        "llama3.2": { inputPer1M: 1, outputPer1M: 2 },
      },
    });
    const encoder = new TextEncoder();

    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({
              model: "llama3.2",
              done: false,
              response: "hello",
            }) + "\n"));
            controller.enqueue(encoder.encode(JSON.stringify({
              model: "llama3.2",
              prompt_eval_count: 900,
              eval_count: 450,
              done: true,
            }) + "\n"));
            controller.close();
          },
        }),
        {
          headers: { "content-type": "application/x-ndjson" },
        },
      );

    const teardown = initProxy(tracker);
    const response = await fetch("http://127.0.0.1:11434/api/generate", { method: "POST" });
    await Promise.race([
      response.text(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("timed out reading streamed response")), 10000);
      }),
    ]);
    teardown();

    const report = tracker.getReport();
    assert.equal(report.steps.length, 1);
    assert.equal(report.steps[0].inputTokens, 900);
    assert.equal(report.steps[0].outputTokens, 450);
  });
});
