import { generate, getModel, type GenerateOptions } from "./gemini";
import { loadPrompt, renderPrompt, type PromptFile, type PromptName } from "./prompts";
import {
  isGrounded,
  parseAdvice,
  parseClassification,
  parseRedFlags,
  type Advice,
  type Classification,
  type RedFlag,
} from "./schemas";

export interface StepTrace {
  step: PromptName;
  /** Raw model text for every attempt (1 = valid first time, 2 = needed the retry). */
  raw: string[];
  firstAttemptValid: boolean;
  latencyMs: number;
}

export interface AnalysisResult {
  classification: Classification;
  red_flags: RedFlag[];
  advice: Advice;
  meta: {
    model: string;
    total_ms: number;
    /** Flags P2 returned whose evidence is not in the message; removed before display. */
    ungrounded_flags: RedFlag[];
    steps: StepTrace[];
  };
}

export class PipelineError extends Error {
  constructor(
    message: string,
    public step: PromptName,
    public steps: StepTrace[],
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

const MAX_ATTEMPTS = 2; // first try + one retry on invalid JSON

async function runStep<T>(
  prompt: PromptFile,
  step: PromptName,
  vars: Record<string, string>,
  parse: (text: string) => T | null,
  steps: StepTrace[],
  options: GenerateOptions,
): Promise<T> {
  const rendered = renderPrompt(prompt.template, vars);
  const trace: StepTrace = { step, raw: [], firstAttemptValid: false, latencyMs: 0 };
  steps.push(trace);
  const started = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await generate(rendered, prompt.config, options);
    trace.raw.push(raw);
    const parsed = parse(raw);
    if (parsed !== null) {
      trace.firstAttemptValid = attempt === 1;
      trace.latencyMs = Date.now() - started;
      return parsed;
    }
  }
  trace.latencyMs = Date.now() - started;
  throw new PipelineError(`${step} returned invalid JSON twice`, step, steps);
}

/** P1 (classify) → P2 (red flags) → P3 (advice), each output feeding the next prompt. */
export async function analyzeMessage(
  message: string,
  options: GenerateOptions = {},
): Promise<AnalysisResult> {
  const started = Date.now();
  const steps: StepTrace[] = [];
  const [p1, p2, p3] = await Promise.all([
    loadPrompt("final", "P1"),
    loadPrompt("final", "P2"),
    loadPrompt("final", "P3"),
  ]);

  const classification = await runStep(p1, "P1", { message }, parseClassification, steps, options);

  const flags = await runStep(
    p2,
    "P2",
    { message, verdict: classification.verdict, scam_type: classification.scam_type },
    parseRedFlags,
    steps,
    options,
  );
  const red_flags = flags.filter((f) => isGrounded(f.evidence, message));
  const ungrounded_flags = flags.filter((f) => !isGrounded(f.evidence, message));

  const advice = await runStep(
    p3,
    "P3",
    {
      verdict: classification.verdict,
      scam_type: classification.scam_type,
      red_flags: JSON.stringify(red_flags),
      language: classification.language,
    },
    parseAdvice,
    steps,
    options,
  );

  return {
    classification,
    red_flags,
    advice,
    meta: { model: getModel(), total_ms: Date.now() - started, ungrounded_flags, steps },
  };
}
