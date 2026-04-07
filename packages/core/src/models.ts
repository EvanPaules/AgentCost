export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic ──────────────────────────────────────────────
  "claude-opus-4-6":              { inputPer1M: 15,   outputPer1M: 75 },
  "claude-sonnet-4-6":            { inputPer1M: 3,    outputPer1M: 15 },
  "claude-haiku-4-5-20251001":    { inputPer1M: 0.8,  outputPer1M: 4 },
  "claude-3-5-sonnet-20241022":   { inputPer1M: 3,    outputPer1M: 15 },
  "claude-3-5-haiku-20241022":    { inputPer1M: 0.8,  outputPer1M: 4 },
  "claude-3-opus-20240229":       { inputPer1M: 15,   outputPer1M: 75 },
  "claude-3-sonnet-20240229":     { inputPer1M: 3,    outputPer1M: 15 },
  "claude-3-haiku-20240307":      { inputPer1M: 0.25, outputPer1M: 1.25 },

  // ── OpenAI ─────────────────────────────────────────────────
  "gpt-4o":                       { inputPer1M: 2.5,  outputPer1M: 10 },
  "gpt-4o-mini":                  { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4-turbo":                  { inputPer1M: 10,   outputPer1M: 30 },
  "gpt-4":                        { inputPer1M: 30,   outputPer1M: 60 },
  "gpt-3.5-turbo":                { inputPer1M: 0.5,  outputPer1M: 1.5 },
  "o1":                           { inputPer1M: 15,   outputPer1M: 60 },
  "o1-mini":                      { inputPer1M: 3,    outputPer1M: 12 },
  "o3":                           { inputPer1M: 10,   outputPer1M: 40 },
  "o3-mini":                      { inputPer1M: 1.1,  outputPer1M: 4.4 },
  "o4-mini":                      { inputPer1M: 1.1,  outputPer1M: 4.4 },

  // ── Google Gemini ──────────────────────────────────────────
  "gemini-2.5-pro":               { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-2.5-flash":             { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gemini-2.0-flash":             { inputPer1M: 0.1,  outputPer1M: 0.4 },
  "gemini-1.5-pro":               { inputPer1M: 1.25, outputPer1M: 5 },
  "gemini-1.5-flash":             { inputPer1M: 0.075,outputPer1M: 0.3 },

  // ── Mistral ────────────────────────────────────────────────
  "mistral-large-latest":         { inputPer1M: 2,    outputPer1M: 6 },
  "mistral-medium-latest":        { inputPer1M: 2.7,  outputPer1M: 8.1 },
  "mistral-small-latest":         { inputPer1M: 0.2,  outputPer1M: 0.6 },
  "codestral-latest":             { inputPer1M: 0.3,  outputPer1M: 0.9 },

  // ── DeepSeek ───────────────────────────────────────────────
  "deepseek-chat":                { inputPer1M: 0.27, outputPer1M: 1.1 },
  "deepseek-reasoner":            { inputPer1M: 0.55, outputPer1M: 2.19 },

  // ── Meta Llama (via Together, Fireworks, etc.) ─────────────
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8": { inputPer1M: 0.27, outputPer1M: 0.85 },
  "meta-llama/Llama-4-Scout-17B-16E-Instruct":         { inputPer1M: 0.18, outputPer1M: 0.59 },
  "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo":     { inputPer1M: 3.5,  outputPer1M: 3.5 },
  "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo":      { inputPer1M: 0.88, outputPer1M: 0.88 },
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo":       { inputPer1M: 0.18, outputPer1M: 0.18 },

  // ── Cohere ─────────────────────────────────────────────────
  "command-r-plus":               { inputPer1M: 2.5,  outputPer1M: 10 },
  "command-r":                    { inputPer1M: 0.15, outputPer1M: 0.6 },

  // ── Amazon Bedrock (Nova) ──────────────────────────────────
  "amazon.nova-pro-v1:0":        { inputPer1M: 0.8,  outputPer1M: 3.2 },
  "amazon.nova-lite-v1:0":       { inputPer1M: 0.06, outputPer1M: 0.24 },
  "amazon.nova-micro-v1:0":      { inputPer1M: 0.035,outputPer1M: 0.14 },
};
