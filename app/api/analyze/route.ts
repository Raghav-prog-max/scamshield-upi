import type { AnalyzeFailure, AnalyzeResponse, AnalyzeErrorCode } from "@/lib/api-types";
import { LlmError } from "@/lib/gemini";
import { analyzeMessage, PipelineError } from "@/lib/pipeline";
import { validateInput } from "@/lib/validate-input";

// Three chained Gemini calls; give the function room on Vercel.
export const maxDuration = 60;

// Best-effort per-IP limit so a public demo can't burn the whole API quota.
// In-memory, so it is per serverless instance — good enough for a prototype.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

function fail(status: number, code: AnalyzeErrorCode, error: string) {
  return Response.json({ ok: false, code, error } satisfies AnalyzeFailure, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "Send JSON like {\"message\": \"...\"}.");
  }

  const check = validateInput((body as { message?: unknown } | null)?.message);
  if (!check.ok) return fail(400, "validation", check.error);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return fail(429, "rate_limited", "Too many checks in a minute. Please wait a moment and try again.");
  }

  try {
    const r = await analyzeMessage(check.message);
    const response: AnalyzeResponse = {
      ok: true,
      result: {
        classification: r.classification,
        red_flags: r.red_flags,
        advice: r.advice,
        meta: {
          model: r.meta.model,
          total_ms: r.meta.total_ms,
          ungrounded_flags_removed: r.meta.ungrounded_flags.length,
          attempts: Object.fromEntries(r.meta.steps.map((s) => [s.step, s.raw.length])),
        },
      },
    };
    return Response.json(response);
  } catch (err) {
    if (err instanceof PipelineError) {
      console.error("[analyze] invalid LLM output", err.step, err.steps.at(-1)?.raw);
      return fail(
        502,
        "invalid_llm_output",
        "The AI gave an answer we couldn't read, even after retrying. Please try again.",
      );
    }
    if (err instanceof LlmError) {
      console.error("[analyze] LLM error", err.kind, err.message);
      if (err.kind === "rate_limit" || err.kind === "quota") {
        return fail(503, "rate_limited", "The AI service is busy right now (rate limit). Please try again in a minute.");
      }
      if (err.kind === "unavailable") {
        return fail(503, "unavailable", "The AI service is temporarily unavailable. Please try again shortly.");
      }
      if (err.kind === "config") {
        return fail(500, "config", "The server is not configured correctly (missing or invalid Gemini API key).");
      }
      return fail(502, "llm_error", "The AI service returned an error. Please try again.");
    }
    console.error("[analyze] unexpected error", err);
    return fail(500, "llm_error", "Something went wrong on our side. Please try again.");
  }
}
