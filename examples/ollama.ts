import { setImmediate } from "node:timers/promises";
import { createTracker, formatReport, initProxy } from "../packages/core/src/index.ts";

async function main(): Promise<void> {
  const model = process.argv[2] ?? "llama3.2";
  const prompt = process.argv.slice(3).join(" ").trim() || "Say hello in one short sentence.";
  const inputPer1M = Number(process.env.AGENTCOST_INPUT_PER_1M ?? "0");
  const outputPer1M = Number(process.env.AGENTCOST_OUTPUT_PER_1M ?? "0");

  if (Number.isNaN(inputPer1M) || Number.isNaN(outputPer1M)) {
    console.error("AGENTCOST_INPUT_PER_1M and AGENTCOST_OUTPUT_PER_1M must be valid numbers.");
    process.exit(1);
  }

  const tracker = createTracker({
    customPricing: {
      [model]: { inputPer1M, outputPer1M },
    },
  });

  const teardown = initProxy(tracker);

  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${text}`);
    }

    const data = await response.json() as {
      message?: { content?: string };
      response?: string;
    };
    const reply = data.message?.content ?? data.response ?? "(no text returned)";
    await setImmediate();

    console.log(reply);
    console.log("");
    console.log(formatReport(tracker.getReport()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Smoke test failed: ${message}`);
    console.error("Make sure Ollama is running and the model exists locally.");
    process.exitCode = 1;
  } finally {
    teardown();
  }
}

void main();
