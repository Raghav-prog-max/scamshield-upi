import type { Advice, Classification, RedFlag } from "./schemas";

export interface AnalyzeSuccess {
  ok: true;
  result: {
    classification: Classification;
    red_flags: RedFlag[];
    advice: Advice;
    meta: {
      model: string;
      total_ms: number;
      ungrounded_flags_removed: number;
      attempts: Record<string, number>;
    };
  };
}

export type AnalyzeErrorCode =
  | "validation"
  | "bad_request"
  | "invalid_llm_output"
  | "rate_limited"
  | "unavailable"
  | "config"
  | "llm_error";

export interface AnalyzeFailure {
  ok: false;
  code: AnalyzeErrorCode;
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;
