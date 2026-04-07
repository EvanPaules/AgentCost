import type { AgentCost } from "./AgentCost.js";

const ANTHROPIC_HOST = "api.anthropic.com";
const OPENAI_HOST = "api.openai.com";
const OLLAMA_CLOUD_HOST = "ollama.com";
const OLLAMA_LOCAL_PORT = "11434";
const OLLAMA_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

type Provider = "anthropic" | "openai" | "ollama";

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OllamaUsage {
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
}

function isTrackedUrl(url: string): Provider | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === ANTHROPIC_HOST || parsed.hostname.endsWith("." + ANTHROPIC_HOST)) {
      return "anthropic";
    }
    if (parsed.hostname === OPENAI_HOST || parsed.hostname.endsWith("." + OPENAI_HOST)) {
      return "openai";
    }
    if (
      parsed.pathname.startsWith("/api/") &&
      (
        ((parsed.hostname === OLLAMA_CLOUD_HOST || parsed.hostname.endsWith("." + OLLAMA_CLOUD_HOST))) ||
        (OLLAMA_LOCAL_HOSTS.has(parsed.hostname) && parsed.port === OLLAMA_LOCAL_PORT)
      )
    ) {
      return "ollama";
    }
  } catch {
    // not a valid URL, ignore
  }
  return null;
}

function extractAnthropicUsage(data: unknown): { model: string; input: number; output: number } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const model = typeof d.model === "string" ? d.model : undefined;
  const usage = d.usage as AnthropicUsage | undefined;
  if (!model || !usage) return null;
  return {
    model,
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
  };
}

function extractOpenAIUsage(data: unknown): { model: string; input: number; output: number } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const model = typeof d.model === "string" ? d.model : undefined;
  const usage = d.usage as OpenAIUsage | undefined;
  if (!model || !usage) return null;
  return {
    model,
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
  };
}

function extractOllamaUsage(data: unknown): { model: string; input: number; output: number } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const model = typeof d.model === "string" ? d.model : undefined;
  const usage = d as OllamaUsage;

  if (!model) return null;
  if ("done" in d && usage.done === false) return null;

  const hasInput = typeof usage.prompt_eval_count === "number";
  const hasOutput = typeof usage.eval_count === "number";
  if (!hasInput && !hasOutput) return null;

  return {
    model,
    input: usage.prompt_eval_count ?? 0,
    output: usage.eval_count ?? 0,
  };
}

function extractUsage(
  provider: Provider,
  data: unknown,
): { model: string; input: number; output: number } | null {
  if (provider === "anthropic") {
    return extractAnthropicUsage(data);
  }
  if (provider === "openai") {
    return extractOpenAIUsage(data);
  }
  return extractOllamaUsage(data);
}

function tryTrack(
  tracker: AgentCost,
  provider: Provider,
  data: unknown,
): void {
  const usage = extractUsage(provider, data);
  if (usage) {
    try {
      tracker.track(usage.model, usage.input, usage.output);
    } catch {
      // Unknown model  - silently skip rather than crashing the app
    }
  }
}

// ── SSE stream parsing ───────────────────────────────────────

/**
 * Wraps a ReadableStream<Uint8Array> to intercept SSE events and extract
 * usage data from the final event. The original stream is passed through
 * unmodified so the caller sees no difference.
 */
function wrapStream(
  body: ReadableStream<Uint8Array>,
  tracker: AgentCost,
  provider: Provider,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        // End of stream  - try to parse anything left in buffer
        if (provider === "ollama") {
          parseNdjsonBuffer(buffer, tracker);
        } else {
          parseSSEBuffer(buffer, tracker, provider);
        }
        controller.close();
        return;
      }

      // Forward the raw bytes to the consumer unchanged
      controller.enqueue(value);

      // Accumulate decoded text to look for usage events
      buffer += decoder.decode(value, { stream: true });

      if (provider === "ollama") {
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          parseNdjsonLine(part, tracker);
        }
        return;
      }

      // Process complete SSE events (delimited by double newline)
      const parts = buffer.split("\n\n");
      // Keep the last part as it may be incomplete
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        parseSSEEvent(part, tracker, provider);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

function parseSSEBuffer(buffer: string, tracker: AgentCost, provider: Provider): void {
  const parts = buffer.split("\n\n");
  for (const part of parts) {
    parseSSEEvent(part, tracker, provider);
  }
}

function parseSSEEvent(raw: string, tracker: AgentCost, provider: Provider): void {
  // Anthropic sends `event: message_delta` with usage in the final chunk.
  // OpenAI sends `data: {...}` with usage in the final chunk.
  // Both include a `data:` line with JSON.
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      // Anthropic streaming: message_stop event has usage at top level
      // or message_delta has usage in the delta
      if (provider === "anthropic") {
        const usage = (json.usage ?? json.delta?.usage) as AnthropicUsage | undefined;
        if (usage && (usage.input_tokens || usage.output_tokens)) {
          const model = json.model ?? json.message?.model;
          if (typeof model === "string") {
            tryTrack(tracker, provider, { model, usage });
          }
        }
      } else {
        // OpenAI streaming: usage shows up in the final chunk
        if (json.usage) {
          tryTrack(tracker, provider, json);
        }
      }
    } catch {
      // Not valid JSON  - skip
    }
  }
}

function parseNdjsonBuffer(buffer: string, tracker: AgentCost): void {
  for (const line of buffer.split("\n")) {
    parseNdjsonLine(line, tracker);
  }
}

function parseNdjsonLine(raw: string, tracker: AgentCost): void {
  const line = raw.trim();
  if (!line) return;

  try {
    tryTrack(tracker, "ollama", JSON.parse(line));
  } catch {
    // Not valid JSON - skip
  }
}

// ── Fetch proxy ──────────────────────────────────────────────

function isStreamResponse(response: Response): boolean {
  const ct = response.headers.get("content-type") ?? "";
  return ct.includes("text/event-stream") || ct.includes("application/x-ndjson");
}

export function initProxy(tracker: AgentCost): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const provider = isTrackedUrl(url);

    if (!provider) {
      return originalFetch(input, init);
    }

    const response = await originalFetch(input, init);

    if (isStreamResponse(response) && response.body) {
      // Wrap the readable stream to intercept SSE usage events
      const wrappedBody = wrapStream(response.body, tracker, provider);
      return new Response(wrappedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // Non-streaming: clone and parse JSON in the background
    const clone = response.clone();
    clone.json().then((json) => {
      tryTrack(tracker, provider, json);
    }).catch(() => {
      // Non-JSON response  - nothing to track
    });

    return response;
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}
