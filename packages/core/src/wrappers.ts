import type { AgentCost } from "./AgentCost.js";

/**
 * Generic interface for an Anthropic-style client.
 * We don't depend on the Anthropic SDK directly — we duck-type it
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
      // Unknown model — skip
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
        // Unknown model — skip
      }
    }
    return result;
  };

  return client;
}
