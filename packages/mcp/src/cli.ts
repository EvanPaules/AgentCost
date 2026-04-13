#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

// Parse CLI flags for configuration
function parseArgs(): { budgetLimit?: number } {
  const args = process.argv.slice(2);
  const result: { budgetLimit?: number } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--budget" && args[i + 1]) {
      const val = parseFloat(args[i + 1]);
      if (!Number.isNaN(val) && val > 0) {
        result.budgetLimit = val;
      }
      i++;
    }
  }

  return result;
}

async function main() {
  const { budgetLimit } = parseArgs();

  const { server } = createMcpServer({ budgetLimit });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("agentcost-mcp: fatal error:", err);
  process.exit(1);
});
