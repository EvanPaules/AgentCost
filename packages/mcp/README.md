# agentcost-mcp

MCP (Model Context Protocol) server for [AgentCost](https://www.npmjs.com/package/agentcost) — track LLM costs from any MCP-compatible AI assistant.

Works with Claude Desktop, Claude Code, Cursor, Windsurf, Copilot, and any other MCP client.

## Install

```bash
npm install -g agentcost-mcp
```

Or use directly with `npx`:

```bash
npx agentcost-mcp
```

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentcost": {
      "command": "npx",
      "args": ["agentcost-mcp"]
    }
  }
}
```

With a budget limit:

```json
{
  "mcpServers": {
    "agentcost": {
      "command": "npx",
      "args": ["agentcost-mcp", "--budget", "5.00"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add agentcost -- npx agentcost-mcp
```

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "mcpServers": {
    "agentcost": {
      "command": "npx",
      "args": ["agentcost-mcp", "--budget", "10.00"]
    }
  }
}
```

## Tools

Once connected, your AI assistant gains these tools:

| Tool | Description |
|------|-------------|
| `track_cost` | Record an LLM API call with model, input/output tokens, and optional agent/label tags |
| `get_report` | Get a formatted cost report (text or JSON) with per-model breakdowns |
| `get_budget_status` | Check current spend against the configured budget limit |
| `estimate_cost` | Estimate the cost of a call before making it |
| `list_models` | List all 40+ supported models with pricing |
| `reset_tracker` | Clear all tracked data and start fresh |

## CLI Options

| Flag | Description |
|------|-------------|
| `--budget <amount>` | Set a budget limit in dollars (e.g., `--budget 5.00`) |

## Programmatic Usage

```ts
import { createMcpServer } from "agentcost-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const { server, tracker } = createMcpServer({
  budgetLimit: 5.0,
  customPricing: {
    "my-model": { inputPer1M: 1, outputPer1M: 3 },
  },
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Supported Models

40+ models built-in: Anthropic (Claude), OpenAI (GPT-4o, o3, o4-mini), Google Gemini, Mistral, DeepSeek, Meta Llama, Cohere, Amazon Nova. Add any model via `customPricing`.

## License

MIT
