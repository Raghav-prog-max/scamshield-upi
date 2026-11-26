/**
 * Runs a prompt version over every case in test-data/inputs.json and records
 * what the model actually returned. Nothing here is hand-entered: every number
 * in test-data/results-summary.md is computed from test-data/outputs/*.json.
 *
 *   npx tsx scripts/run-tests.ts --version v1        # P1 v1 only
 *   npx tsx scripts/run-tests.ts --version final     # full P1 -> P2 -> P3 pipeline
 *   npx tsx scripts/run-tests.ts --version all       # v1, v2, v3, final in order
 *   options: --runs 2 (default)  --only N1,E5  --summary-only
 *
 * Needs GEMINI_API_KEY (read from the environment or .env.local).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Version = "v1" | "v2" | "v3" | "final";
const VERSIONS: Version[] = ["v1", "v2", "v3", "final"];
type VerdictOrMore = "scam" | "suspicious" | "safe" | "invalid" | "unparsed" | "error";

interface TestCase {
  id: string;
  type: "normal" | "edge" | "invalid";
  description: string;
  input: string;
  expected_verdict: "scam" | "suspicious" | "safe" | "invalid";
  expected_language: "en" | "hi" | "hinglish" | null;
}

interface RunRecord {
  run: number;
  verdict: VerdictOrMore;
  language?: string | null;
  json_valid?: boolean;
  latency_ms?: number;
  raw?: string;
  [key: string]: unknown;
}

interface CaseRecord {
  id: string;
  type: string;
  description: string;
  expected_verdict: string;
  expected_language: string | null;
  validator: "passed" | "empty" | "too_long";
  runs: RunRecord[];
}

interface Metrics {
  cases: number;
  llm_cases: number;
  runs_per_case: number;
  accuracy_strict: { correct: number; total: number };
  accuracy_risky_vs_safe: { correct: number; total: number };
  json_valid: { valid: number; total: number; what: string };
  consistency: { consistent: number; total: number } | null;
  wrong: string[];
  language_detected?: { correct: number; total: number };
  extra?: Record<string, string>;
}

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "test-data", "outputs");
const SUMMARY = path.join(ROOT, "test-data", "results-summary.md");

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    version: get("version") ?? "final",
    runs: Number(get("runs") ?? 2),
    only: get("only")?.split(","),
    summaryOnly: a.includes("--summary-only"),
  };
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((100 * n) / d)}%`);
const frac = (x: { correct?: number; valid?: number; consistent?: number; total: number }) => {
  const n = x.correct ?? x.valid ?? x.consistent ?? 0;
  return `${n}/${x.total} (${pct(n, x.total)})`;
};
const risky = (v: string) => (v === "scam" || v === "suspicious" ? "risky" : v);
const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);
const HINGLISH_WORDS =
  /\b(hai|hain|karo|karein|kare|karen|na|nahi|nahin|aap|aapka|aapke|apna|apne|kisi|ko|se|mein|ke|ki|ka|turant|agar|bhi|ya)\b/gi;

async function main() {
  const opts = args();
  if (!existsSync(path.join(ROOT, "prompts")) || !existsSync(path.join(ROOT, "test-data"))) {
    throw new Error("Run this from the project root (the folder with prompts/ and test-data/).");
  }
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // fine if the key is already in the environment
  }

  if (opts.summaryOnly) return writeSummary();
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Put it in .env.local (see .env.example).");
  }

  const versions: Version[] =
    opts.version === "all" ? VERSIONS : VERSIONS.includes(opts.version as Version) ? [opts.version as Version] : [];
  if (versions.length === 0) throw new Error(`Unknown --version ${opts.version}. Use v1, v2, v3, final or all.`);

  let cases: TestCase[] = JSON.parse(readFileSync(path.join(ROOT, "test-data", "inputs.json"), "utf8"));
  if (opts.only) cases = cases.filter((c) => opts.only!.includes(c.id));

  for (const version of versions) {
    await runVersion(version, cases, opts.runs);
  }
  writeSummary();
}

async function runVersion(version: Version, cases: TestCase[], runs: number) {
  // Imported here so .env.local is loaded before the modules read it.
  const { loadPrompt, renderPrompt } = await import("../lib/prompts");
  const { generate, getModel, LlmError } = await import("../lib/gemini");
  const { parseClassification } = await import("../lib/schemas");
  const { analyzeMessage, PipelineError } = await import("../lib/pipeline");
  const { validateInput } = await import("../lib/validate-input");

  const onWait = (ms: number, reason: string) =>
    console.log(`    … ${reason} Waiting ${Math.round(ms / 1000)} s and retrying.`);
  const genOpts = { rateLimitRetries: 8, networkRetries: 4, networkWaitMs: 15_000, onWait };

  console.log(`\n=== ${version} · ${getModel()} · ${cases.length} cases × ${runs} runs ===`);
  const records: CaseRecord[] = [];

  for (const c of cases) {
    const check = validateInput(c.input);
    const rec: CaseRecord = {
      id: c.id,
      type: c.type,
      description: c.description,
      expected_verdict: c.expected_verdict,
      expected_language: c.expected_language,
      validator: check.ok ? "passed" : check.reason,
      runs: [],
    };
    records.push(rec);

    if (!check.ok) {
      for (let r = 1; r <= runs; r++) rec.runs.push({ run: r, verdict: "invalid" });
      console.log(`  ${c.id.padEnd(3)} rejected by validator (${check.reason}) — no LLM call`);
      continue;
    }

    for (let r = 1; r <= runs; r++) {
      const started = Date.now();
      try {
        if (version === "final") {
          rec.runs.push(await runPipeline(check.message, r));
        } else {
          const p1 = await loadPrompt(version, "P1");
          const raw = await generate(renderPrompt(p1.template, { message: check.message }), p1.config, genOpts);
          const strict = parseClassification(raw);
          const lenient = lenientParse(raw, version);
          rec.runs.push({
            run: r,
            verdict: lenient.verdict,
            language: lenient.language,
            confidence: lenient.confidence,
            scam_type: lenient.scam_type,
            json_valid: strict !== null,
            latency_ms: Date.now() - started,
            raw,
          });
        }
      } catch (err) {
        // Infrastructure failures say nothing about the prompt: stop instead of
        // recording them as wrong verdicts. (2026-11-22: a dropped connection
        // turned every v2/v3/final call into "fetch failed" and was counted as wrong.)
        if (
          err instanceof LlmError &&
          (err.kind === "quota" || err.kind === "config" || err.kind === "network" || err.kind === "unavailable")
        ) {
          console.error(`\nStopped: ${err.message} Results for ${version} were NOT saved (not a prompt result).`);
          process.exit(1);
        }
        rec.runs.push({
          run: r,
          verdict: "error",
          error: err instanceof Error ? err.message : String(err),
          latency_ms: Date.now() - started,
          ...(err instanceof PipelineError && { steps: err.steps }),
        });
      }
      const last = rec.runs.at(-1)!;
      const mark = last.verdict === c.expected_verdict ? "ok " : "XX ";
      console.log(
        `  ${c.id.padEnd(3)} run ${r}: ${mark}${String(last.verdict).padEnd(10)} (expected ${c.expected_verdict})` +
          (last.json_valid === false ? "  [invalid JSON]" : "") +
          ` ${((last.latency_ms ?? 0) / 1000).toFixed(1)}s`,
      );
    }
  }

  const metrics = computeMetrics(version, records, runs);
  const output = {
    version,
    model: getModel(),
    run_at: new Date().toISOString(),
    runs_per_case: runs,
    prompt_files:
      version === "final"
        ? ["prompts/final/P1.md", "prompts/final/P2.md", "prompts/final/P3.md"]
        : [`prompts/${version}/P1.md`],
    metrics,
    cases: records,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${version}.json`), JSON.stringify(output, null, 2) + "\n");

  console.log(`\n--- ${version} results ---`);
  console.log(`Accuracy (strict verdict):   ${frac(metrics.accuracy_strict)}`);
  console.log(`Accuracy (risky vs safe):    ${frac(metrics.accuracy_risky_vs_safe)}`);
  console.log(`JSON valid:                  ${frac(metrics.json_valid)}  [${metrics.json_valid.what}]`);
  console.log(
    `Run-to-run consistency:      ${metrics.consistency ? frac(metrics.consistency) : "n/a (1 run)"}`,
  );
  if (metrics.language_detected) console.log(`Language detected (P1):      ${frac(metrics.language_detected)}`);
  for (const [k, v] of Object.entries(metrics.extra ?? {})) console.log(`${(k + ":").padEnd(29)}${v}`);
  console.log(`Wrong verdicts:              ${metrics.wrong.join(", ") || "none"}`);
  console.log(`Saved test-data/outputs/${version}.json`);

  async function runPipeline(message: string, run: number): Promise<RunRecord> {
    const started = Date.now();
    try {
      const r = await analyzeMessage(message, genOpts);
      return {
        run,
        verdict: r.classification.verdict,
        language: r.classification.language,
        json_valid: r.meta.steps.every((s) => s.firstAttemptValid),
        latency_ms: Date.now() - started,
        classification: r.classification,
        red_flags: r.red_flags,
        ungrounded_flags: r.meta.ungrounded_flags,
        advice: r.advice,
        steps: r.meta.steps,
      };
    } catch (err) {
      if (err instanceof PipelineError) {
        return {
          run,
          verdict: "error",
          error: err.message,
          json_valid: false,
          latency_ms: Date.now() - started,
          steps: err.steps,
        };
      }
      throw err;
    }
  }
}

/**
 * Reads the verdict even when the output is not strict JSON, so accuracy and
 * JSON validity are measured separately. v1 has no format: its first "yes"
 * counts as scam and its first "no" as safe.
 */
function lenientParse(raw: string, version: Version) {
  const out: { verdict: VerdictOrMore; language: string | null; confidence: number | null; scam_type: string | null } =
    { verdict: "unparsed", language: null, confidence: null, scam_type: null };
  const candidates = [raw, raw.replace(/```(?:json)?/gi, "")];
  for (const text of candidates) {
    try {
      const obj = JSON.parse(text.trim());
      if (obj && typeof obj === "object" && typeof obj.verdict === "string") {
        out.verdict = (["scam", "suspicious", "safe"].includes(obj.verdict) ? obj.verdict : "unparsed") as VerdictOrMore;
        out.language = typeof obj.language === "string" ? obj.language : null;
        out.confidence = typeof obj.confidence === "number" ? obj.confidence : null;
        out.scam_type = typeof obj.scam_type === "string" ? obj.scam_type : null;
        return out;
      }
    } catch {
      // try the next candidate
    }
  }
  const field = raw.match(/"verdict"\s*:\s*"(scam|suspicious|safe)"/i);
  if (field) {
    out.verdict = field[1].toLowerCase() as VerdictOrMore;
    out.language = raw.match(/"language"\s*:\s*"(en|hi|hinglish)"/i)?.[1] ?? null;
    return out;
  }
  if (version === "v1") {
    const yn = raw.match(/\b(yes|no)\b/i);
    if (yn) out.verdict = yn[1].toLowerCase() === "yes" ? "scam" : "safe";
  }
  return out;
}

function computeMetrics(version: Version, records: CaseRecord[], runs: number): Metrics {
  const llm = records.filter((r) => r.validator === "passed");
  const all = records.flatMap((r) => r.runs.map((run) => ({ rec: r, run })));
  const llmRuns = llm.flatMap((r) => r.runs.map((run) => ({ rec: r, run })));

  const strictCorrect = all.filter(({ rec, run }) => run.verdict === rec.expected_verdict).length;
  const binaryCorrect = all.filter(({ rec, run }) => risky(run.verdict) === risky(rec.expected_verdict)).length;
  const wrong = all
    .filter(({ rec, run }) => run.verdict !== rec.expected_verdict)
    .map(({ rec, run }) => `${rec.id}#${run.run} ${run.verdict}→${rec.expected_verdict}`);

  const consistency =
    runs < 2
      ? null
      : {
          consistent: llm.filter((r) => {
            const vs = r.runs.map((x) => x.verdict);
            return !["unparsed", "error"].includes(vs[0]) && vs.every((v) => v === vs[0]);
          }).length,
          total: llm.length,
        };

  const metrics: Metrics = {
    cases: records.length,
    llm_cases: llm.length,
    runs_per_case: runs,
    accuracy_strict: { correct: strictCorrect, total: all.length },
    accuracy_risky_vs_safe: { correct: binaryCorrect, total: all.length },
    json_valid: { valid: 0, total: 0, what: "" },
    consistency,
    wrong,
  };

  if (version !== "v1") {
    metrics.language_detected = {
      correct: llmRuns.filter(({ rec, run }) => run.language === rec.expected_language).length,
      total: llmRuns.length,
    };
  }

  if (version !== "final") {
    metrics.json_valid = {
      valid: llmRuns.filter(({ run }) => run.json_valid).length,
      total: llmRuns.length,
      what: "P1 responses that parse with JSON.parse and match the schema",
    };
    return metrics;
  }

  // Final pipeline: count every step's first attempt, plus P2/P3-specific checks.
  type Step = { step: string; raw: string[]; firstAttemptValid: boolean };
  const steps = llmRuns.flatMap(({ run }) => (run.steps as Step[] | undefined) ?? []);
  metrics.json_valid = {
    valid: steps.filter((s) => s.firstAttemptValid).length,
    total: steps.length,
    what: "P1+P2+P3 first attempts that were strictly valid JSON",
  };
  const retried = steps.filter((s) => s.raw.length > 1);
  const okRuns = llmRuns.filter(({ run }) => run.verdict !== "error");
  type Flag = { evidence: string };
  const kept = okRuns.reduce((n, { run }) => n + ((run.red_flags as Flag[]) ?? []).length, 0);
  const dropped = okRuns.reduce((n, { run }) => n + ((run.ungrounded_flags as Flag[]) ?? []).length, 0);
  const safeRuns = okRuns.filter(({ run }) => run.verdict === "safe");
  const safeEmpty = safeRuns.filter(
    ({ run }) => ((run.red_flags as Flag[]).length + (run.ungrounded_flags as Flag[]).length) === 0,
  ).length;

  type AdviceT = { summary: string; do_now: string[]; never_do: string[]; report: string };
  const langOk = okRuns.filter(({ run }) => {
    const a = run.advice as AdviceT;
    const text = [a.summary, ...a.do_now, ...a.never_do].join(" ");
    const hinglishHits = (text.match(HINGLISH_WORDS) ?? []).length;
    if (run.language === "hi") return hasDevanagari(text);
    if (run.language === "hinglish") return !hasDevanagari(text) && hinglishHits >= 3;
    return !hasDevanagari(text) && hinglishHits < 3;
  }).length;
  const riskyRuns = okRuns.filter(({ run }) => run.verdict !== "safe");
  const reportOk =
    riskyRuns.filter(({ run }) => /1930|cybercrime\.gov\.in/i.test((run.advice as AdviceT).report)).length +
    safeRuns.filter(({ run }) => (run.advice as AdviceT).report.trim() === "").length;

  metrics.extra = {
    "Pipeline runs failed": `${llmRuns.length - okRuns.length}/${llmRuns.length}`,
    "Steps that needed the retry": `${retried.length}/${steps.length}`,
    "P2 evidence quoted verbatim": `${kept}/${kept + dropped} flags (${dropped} not found in message, removed)`,
    "P2 returns [] when safe": `${safeEmpty}/${safeRuns.length} safe runs`,
    "P3 reply in user's language": `${langOk}/${okRuns.length} runs (script + Hinglish-word heuristic)`,
    "P3 report line correct": `${reportOk}/${okRuns.length} runs (1930/cybercrime.gov.in if risky, empty if safe)`,
    "Avg pipeline time": `${(okRuns.reduce((n, { run }) => n + (run.latency_ms ?? 0), 0) / Math.max(1, okRuns.length) / 1000).toFixed(1)} s`,
  };
  return metrics;
}

function writeSummary() {
  const files = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")) : [];
  const outputs = VERSIONS.filter((v) => files.includes(`${v}.json`)).map(
    (v) => JSON.parse(readFileSync(path.join(OUT_DIR, `${v}.json`), "utf8")) as {
      version: Version;
      model: string;
      run_at: string;
      metrics: Metrics;
    },
  );

  const lines = [
    "# Test results summary",
    "",
    "Generated by `npx tsx scripts/run-tests.ts` from the files in `test-data/outputs/`. Do not edit by hand.",
    "",
    "- **Accuracy (strict)**: verdict exactly equals `expected_verdict`, counted over every case × run (validator-rejected cases count as correct only if rejected).",
    "- **Accuracy (risky vs safe)**: `scam` and `suspicious` are treated as the same class.",
    "- **JSON valid**: raw model text passes `JSON.parse` *and* matches the schema, with no clean-up. v1–v3 count P1 responses; final counts the first attempt of every P1/P2/P3 call.",
    "- **Consistency**: LLM cases whose verdict was identical on both runs.",
    "",
    "| Version | Run at (UTC) | Model | Accuracy (strict) | Accuracy (risky vs safe) | JSON valid | Consistency | Wrong verdicts (case#run got→expected) |",
    "|---|---|---|---|---|---|---|---|",
    ...outputs.map(
      (o) =>
        `| ${o.version} | ${o.run_at.slice(0, 16).replace("T", " ")} | ${o.model} | ${frac(o.metrics.accuracy_strict)} | ${frac(o.metrics.accuracy_risky_vs_safe)} | ${frac(o.metrics.json_valid)} | ${o.metrics.consistency ? frac(o.metrics.consistency) : "n/a"} | ${o.metrics.wrong.join(", ") || "none"} |`,
    ),
    "",
  ];

  for (const o of outputs) {
    const extra = Object.entries(o.metrics.extra ?? {});
    if (!o.metrics.language_detected && extra.length === 0) continue;
    lines.push(`### ${o.version}: extra measurements`, "");
    if (o.metrics.language_detected) lines.push(`- Language detected by P1: ${frac(o.metrics.language_detected)}`);
    for (const [k, v] of extra) lines.push(`- ${k}: ${v}`);
    lines.push("");
  }

  writeFileSync(SUMMARY, lines.join("\n"));
  console.log(`\nWrote ${path.relative(ROOT, SUMMARY)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
