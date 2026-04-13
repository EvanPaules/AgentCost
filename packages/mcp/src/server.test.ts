import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";

async function setupClient(options = {}) {
  const { server } = createMcpServer(options);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

describe("agentcost MCP server", () => {
  it("lists all expected tools", async () => {
    const { client } = await setupClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, [
      "estimate_cost",
      "get_budget_status",
      "get_report",
      "list_models",
      "reset_tracker",
      "track_cost",
    ]);
  });

  it("track_cost records a call and returns cost info", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "track_cost",
      arguments: { model: "gpt-4o", input_tokens: 1000, output_tokens: 500 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("gpt-4o"));
    assert.ok(text.includes("Running total"));
    assert.ok(text.includes("$"));
  });

  it("track_cost returns error for unknown model", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "track_cost",
      arguments: { model: "nonexistent-model-xyz", input_tokens: 100, output_tokens: 50 },
    });
    assert.strictEqual(result.isError, true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("Unknown model"));
  });

  it("get_report shows 'no calls' when empty", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "get_report",
      arguments: { format: "text" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("No API calls tracked yet"));
  });

  it("get_report returns formatted report after tracking", async () => {
    const { client } = await setupClient();
    await client.callTool({
      name: "track_cost",
      arguments: { model: "gpt-4o", input_tokens: 1000, output_tokens: 500 },
    });
    const result = await client.callTool({
      name: "get_report",
      arguments: { format: "text" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("AgentCost Report"));
    assert.ok(text.includes("gpt-4o"));
  });

  it("get_report returns JSON format", async () => {
    const { client } = await setupClient();
    await client.callTool({
      name: "track_cost",
      arguments: { model: "gpt-4o", input_tokens: 500, output_tokens: 200 },
    });
    const result = await client.callTool({
      name: "get_report",
      arguments: { format: "json" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    assert.ok(parsed.totalCost > 0);
    assert.ok(Array.isArray(parsed.byModel));
  });

  it("get_budget_status shows no limit when unconfigured", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "get_budget_status",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("No budget limit configured"));
  });

  it("get_budget_status reports usage against limit", async () => {
    const { client } = await setupClient({ budgetLimit: 1.0 });
    await client.callTool({
      name: "track_cost",
      arguments: { model: "gpt-4o", input_tokens: 10000, output_tokens: 5000 },
    });
    const result = await client.callTool({
      name: "get_budget_status",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("Budget Status:"));
    assert.ok(text.includes("$1.00"));
  });

  it("estimate_cost returns cost estimate", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "estimate_cost",
      arguments: { model: "gpt-4o", input_tokens: 1000000, output_tokens: 500000 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("Cost estimate for gpt-4o"));
    assert.ok(text.includes("$"));
  });

  it("estimate_cost warns when budget would be exceeded", async () => {
    const { client } = await setupClient({ budgetLimit: 0.01 });
    const result = await client.callTool({
      name: "estimate_cost",
      arguments: { model: "gpt-4o", input_tokens: 1000000, output_tokens: 1000000 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("WARNING"));
    assert.ok(text.includes("exceeding"));
  });

  it("estimate_cost errors for unknown model with suggestions", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "estimate_cost",
      arguments: { model: "gpt-unknown", input_tokens: 100, output_tokens: 100 },
    });
    assert.strictEqual(result.isError, true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("gpt-"));
  });

  it("list_models returns all models", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "list_models",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("Supported models"));
    assert.ok(text.includes("gpt-4o"));
    assert.ok(text.includes("claude"));
  });

  it("list_models filters by provider", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "list_models",
      arguments: { filter: "gemini" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("gemini"));
    assert.ok(!text.includes("gpt-4o"));
  });

  it("reset_tracker clears all data", async () => {
    const { client } = await setupClient();
    await client.callTool({
      name: "track_cost",
      arguments: { model: "gpt-4o", input_tokens: 1000, output_tokens: 500 },
    });
    const resetResult = await client.callTool({
      name: "reset_tracker",
      arguments: {},
    });
    const resetText = (resetResult.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(resetText.includes("Cleared 1 calls"));

    // Verify it's actually empty
    const reportResult = await client.callTool({
      name: "get_report",
      arguments: { format: "text" },
    });
    const reportText = (reportResult.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(reportText.includes("No API calls tracked yet"));
  });

  it("track_cost with agent and label metadata", async () => {
    const { client } = await setupClient();
    const result = await client.callTool({
      name: "track_cost",
      arguments: {
        model: "gpt-4o",
        input_tokens: 1000,
        output_tokens: 500,
        agent: "planner",
        label: "initial-plan",
      },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("gpt-4o"));
  });

  it("track_cost shows budget info when limit is set", async () => {
    const { client } = await setupClient({ budgetLimit: 10.0 });
    const result = await client.callTool({
      name: "track_cost",
      arguments: { model: "gpt-4o", input_tokens: 1000, output_tokens: 500 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.ok(text.includes("Budget:"));
    assert.ok(text.includes("$10.00"));
  });
});
