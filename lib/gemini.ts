import { ApiError, GoogleGenAI } from "@google/genai";
import type { PromptConfig } from "./prompts";

export type LlmErrorKind = "config" | "rate_limit" | "quota" | "unavailable" | "network" | "api";

export class LlmError extends Error {
  constructor(
    message: string,
    public kind: LlmErrorKind,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface GenerateOptions {
  /** How many times to wait and retry after a 429 (per-minute limit). The web app uses 0. */
  rateLimitRetries?: number;
  /** Retries after a network failure (no HTTP response at all). Default 1. */
  networkRetries?: number;
  /** Wait before each network retry. Default 2 s. */
  networkWaitMs?: number;
  onWait?: (ms: number, reason: string) => void;
}

let client: GoogleGenAI | null = null;

// Read lazily so scripts can load .env.local before the first call.
export function getModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmError("GEMINI_API_KEY is not set on the server.", "config");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof ApiError ? err.status : undefined;

  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
    const perDay = /PerDay/i.test(message);
    const delay = message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
    return new LlmError(
      perDay ? "Daily Gemini quota exhausted." : "Gemini rate limit hit.",
      perDay ? "quota" : "rate_limit",
      delay ? Math.ceil(Number(delay[1]) * 1000) : undefined,
    );
  }
  if (status === 500 || status === 503 || /UNAVAILABLE|overloaded/i.test(message)) {
    return new LlmError("Gemini is temporarily unavailable.", "unavailable");
  }
  if (status === 400 && /API key/i.test(message)) {
    return new LlmError("The Gemini API key was rejected.", "config");
  }
  if (status === 404) {
    return new LlmError(`Model "${getModel()}" was not found: ${message.slice(0, 200)}`, "config");
  }
  // No HTTP response at all: the request never reached Gemini (connection down, DNS, timeout).
  if (status === undefined && /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(message)) {
    return new LlmError("Could not reach Gemini (network error).", "network");
  }
  return new LlmError(`Gemini request failed: ${message.slice(0, 300)}`, "api");
}

/**
 * One Gemini call. Returns the raw text exactly as the model produced it, so
 * callers (and the test runner) can judge whether it is valid JSON.
 * Retries briefly on 500/503 ("model overloaded"); 429s are only retried
 * when the caller asks for it.
 */
export async function generate(
  prompt: string,
  config: PromptConfig,
  options: GenerateOptions = {},
): Promise<string> {
  const ai = getClient();
  let rateLimitRetries = options.rateLimitRetries ?? 0;
  let unavailableRetries = 2;
  let networkRetries = options.networkRetries ?? 1;

  for (;;) {
    try {
      const res = await ai.models.generateContent({
        model: getModel(),
        contents: prompt,
        config: {
          ...(config.temperature !== undefined && { temperature: config.temperature }),
          ...(config.responseMimeType && { responseMimeType: config.responseMimeType }),
          ...(config.thinkingBudget !== undefined && {
            thinkingConfig: { thinkingBudget: config.thinkingBudget },
          }),
        },
      });
      return res.text ?? "";
    } catch (raw) {
      const err = toLlmError(raw);
      if (err.kind === "unavailable" && unavailableRetries-- > 0) {
        const wait = 2000;
        options.onWait?.(wait, err.message);
        await sleep(wait);
        continue;
      }
      if (err.kind === "network" && networkRetries-- > 0) {
        const wait = options.networkWaitMs ?? 2000;
        options.onWait?.(wait, err.message);
        await sleep(wait);
        continue;
      }
      if (err.kind === "rate_limit" && rateLimitRetries-- > 0) {
        const wait = (err.retryAfterMs ?? 20000) + 1000;
        options.onWait?.(wait, err.message);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}
