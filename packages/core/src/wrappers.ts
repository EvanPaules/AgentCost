import type { AgentCost } from "./AgentCost.js";

/**
 * Generic interface for an Anthropic-style client.
 * We don't depend on the Anthropic SDK directly  - we duck-type it
 * so users can wrap any version.
 */
interface AnthropicMessage {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicMessagesAPI {
  create(params: Record<string, unknown>): Promise<AnthropicMessage>;
}

interface AnthropicLikeClient {
  messages: AnthropicMessagesAPI;
}

/**
 * Wraps an Anthropic SDK client so every `messages.create()` call
 * is automatically tracked.
 *
 * @example
 * ```ts
 * import Anthropic from "@anthropic-ai/sdk";
 * import { createTracker, wrapAnthropic } from "@agent-cost/core";
 *
 * const tracker = createTracker();
 * const client = wrapAnthropic(new Anthropic(), tracker);
 * const msg = await client.messages.create({ model: "claude-sonnet-4-6", ... });
 * console.log(tracker.getReport());
 * ```
 */
export function wrapAnthropic<T extends AnthropicLikeClient>(
  client: T,
  tracker: AgentCost,
): T {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = async function trackedCreate(
    params: Record<string, unknown>,
  ): Promise<AnthropicMessage> {
    const result = await original(params);
    try {
      tracker.track(
        result.model,
        result.usage.input_tokens,
        result.usage.output_tokens,
        params.metadata as Record<string, unknown> | undefined,
      );
    } catch {
      // Unknown model  - skip
    }
    return result;
  };

  return client;
}

/**
 * Generic interface for an OpenAI-style client.
 */
interface OpenAIChatCompletion {
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

interface OpenAIChatCompletionsAPI {
  create(params: Record<string, unknown>): Promise<OpenAIChatCompletion>;
}

interface OpenAILikeClient {
  chat: {
    completions: OpenAIChatCompletionsAPI;
  };
}

/**
 * Wraps an OpenAI SDK client so every `chat.completions.create()` call
 * is automatically tracked.
 *
 * @example
 * ```ts
 * import OpenAI from "openai";
 * import { createTracker, wrapOpenAI } from "@agent-cost/core";
 *
 * const tracker = createTracker();
 * const client = wrapOpenAI(new OpenAI(), tracker);
 * const res = await client.chat.completions.create({ model: "gpt-4o", ... });
 * console.log(tracker.getReport());
 * ```
 */
export function wrapOpenAI<T extends OpenAILikeClient>(
  client: T,
  tracker: AgentCost,
): T {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async function trackedCreate(
    params: Record<string, unknown>,
  ): Promise<OpenAIChatCompletion> {
    const result = await original(params);
    if (result.usage) {
      try {
        tracker.track(
          result.model,
          result.usage.prompt_tokens,
          result.usage.completion_tokens,
          params.metadata as Record<string, unknown> | undefined,
        );
      } catch {
        // Unknown model  - skip
      }
    }
    return result;
  };

  return client;
}

interface OllamaUsageResponse {
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
}

interface OllamaLikeClient {
  chat(params: Record<string, unknown>): Promise<OllamaUsageResponse | AsyncIterable<OllamaUsageResponse>>;
  generate(params: Record<string, unknown>): Promise<OllamaUsageResponse | AsyncIterable<OllamaUsageResponse>>;
  embed?(params: Record<string, unknown>): Promise<OllamaUsageResponse>;
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    value != null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator as keyof typeof value] === "function"
  );
}

function trackOllamaUsage(
  tracker: AgentCost,
  result: OllamaUsageResponse,
  meta?: Record<string, unknown>,
): void {
  if (result.done === false) {
    return;
  }

  const inputTokens = result.prompt_eval_count ?? 0;
  const outputTokens = result.eval_count ?? 0;

  if (inputTokens === 0 && outputTokens === 0) {
    return;
  }

  try {
    tracker.track(result.model, inputTokens, outputTokens, meta);
  } catch {
    // Unknown model - skip
  }
}

async function* trackOllamaStream(
  stream: AsyncIterable<OllamaUsageResponse>,
  tracker: AgentCost,
  meta?: Record<string, unknown>,
): AsyncGenerator<OllamaUsageResponse> {
  let finalChunk: OllamaUsageResponse | null = null;

  for await (const part of stream) {
    finalChunk = part;
    yield part;
  }

  if (finalChunk) {
    trackOllamaUsage(tracker, finalChunk, meta);
  }
}

/**
 * Wraps an Ollama client so `chat()`, `generate()`, and `embed()` calls
 * are tracked automatically.
 *
 * Ollama models usually need `customPricing` because local model names are
 * not part of the built-in hosted-provider pricing table.
 */
export function wrapOllama<T extends OllamaLikeClient>(
  client: T,
  tracker: AgentCost,
): T {
  const originalChat = client.chat.bind(client);
  const originalGenerate = client.generate.bind(client);
  const originalEmbed = client.embed?.bind(client);

  client.chat = async function trackedChat(
    params: Record<string, unknown>,
  ): Promise<OllamaUsageResponse | AsyncIterable<OllamaUsageResponse>> {
    const result = await originalChat(params);
    const meta = params.metadata as Record<string, unknown> | undefined;
    return isAsyncIterable<OllamaUsageResponse>(result)
      ? trackOllamaStream(result, tracker, meta)
      : (trackOllamaUsage(tracker, result, meta), result);
  };

  client.generate = async function trackedGenerate(
    params: Record<string, unknown>,
  ): Promise<OllamaUsageResponse | AsyncIterable<OllamaUsageResponse>> {
    const result = await originalGenerate(params);
    const meta = params.metadata as Record<string, unknown> | undefined;
    return isAsyncIterable<OllamaUsageResponse>(result)
      ? trackOllamaStream(result, tracker, meta)
      : (trackOllamaUsage(tracker, result, meta), result);
  };

  if (originalEmbed) {
    client.embed = async function trackedEmbed(
      params: Record<string, unknown>,
    ): Promise<OllamaUsageResponse> {
      const result = await originalEmbed(params);
      trackOllamaUsage(
        tracker,
        {
          model: result.model,
          prompt_eval_count: result.prompt_eval_count,
          eval_count: 0,
        },
        params.metadata as Record<string, unknown> | undefined,
      );
      return result;
    };
  }

  return client;
}
