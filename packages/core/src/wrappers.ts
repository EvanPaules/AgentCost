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

interface AnthropicStreamEvent {
  type?: string;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  message?: { model?: string; usage?: { input_tokens: number; output_tokens: number } };
  delta?: { usage?: { output_tokens: number } };
}

interface AnthropicMessagesAPI {
  create(params: Record<string, unknown>): Promise<AnthropicMessage | AsyncIterable<AnthropicStreamEvent>>;
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
async function* trackAnthropicStream(
  stream: AsyncIterable<AnthropicStreamEvent>,
  tracker: AgentCost,
  meta?: Record<string, unknown>,
): AsyncGenerator<AnthropicStreamEvent> {
  let model: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    yield event;

    if (event.model) model = event.model;
    if (event.message?.model) model = event.message.model;

    if (event.usage) {
      if (event.usage.input_tokens) inputTokens = event.usage.input_tokens;
      if (event.usage.output_tokens) outputTokens = event.usage.output_tokens;
    }
    if (event.delta?.usage?.output_tokens) {
      outputTokens = event.delta.usage.output_tokens;
    }
  }

  if (model && (inputTokens > 0 || outputTokens > 0)) {
    try {
      tracker.track(model, inputTokens, outputTokens, meta);
    } catch {
      // Unknown model - skip
    }
  }
}

export function wrapAnthropic<T extends AnthropicLikeClient>(
  client: T,
  tracker: AgentCost,
): T {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = async function trackedCreate(
    params: Record<string, unknown>,
  ): Promise<AnthropicMessage | AsyncIterable<AnthropicStreamEvent>> {
    const result = await original(params);
    const meta = params.metadata as Record<string, unknown> | undefined;

    if (isAsyncIterable<AnthropicStreamEvent>(result)) {
      return trackAnthropicStream(result, tracker, meta);
    }

    const msg = result as AnthropicMessage;
    try {
      tracker.track(
        msg.model,
        msg.usage.input_tokens,
        msg.usage.output_tokens,
        meta,
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

interface OpenAIStreamChunk {
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

interface OpenAIChatCompletionsAPI {
  create(params: Record<string, unknown>): Promise<OpenAIChatCompletion | AsyncIterable<OpenAIStreamChunk>>;
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
async function* trackOpenAIStream(
  stream: AsyncIterable<OpenAIStreamChunk>,
  tracker: AgentCost,
  meta?: Record<string, unknown>,
): AsyncGenerator<OpenAIStreamChunk> {
  let model: string | undefined;

  for await (const chunk of stream) {
    yield chunk;

    if (chunk.model) model = chunk.model;

    if (model && chunk.usage) {
      try {
        tracker.track(
          model,
          chunk.usage.prompt_tokens,
          chunk.usage.completion_tokens,
          meta,
        );
      } catch {
        // Unknown model - skip
      }
    }
  }
}

export function wrapOpenAI<T extends OpenAILikeClient>(
  client: T,
  tracker: AgentCost,
): T {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async function trackedCreate(
    params: Record<string, unknown>,
  ): Promise<OpenAIChatCompletion | AsyncIterable<OpenAIStreamChunk>> {
    const result = await original(params);
    const meta = params.metadata as Record<string, unknown> | undefined;

    if (isAsyncIterable<OpenAIStreamChunk>(result)) {
      return trackOpenAIStream(result, tracker, meta);
    }

    const completion = result as OpenAIChatCompletion;
    if (completion.usage) {
      try {
        tracker.track(
          completion.model,
          completion.usage.prompt_tokens,
          completion.usage.completion_tokens,
          meta,
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
