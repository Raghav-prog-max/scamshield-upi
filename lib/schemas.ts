// Output contracts for the three prompts, plus strict validators.
// "Strict" means: the raw model text must parse with JSON.parse (no code
// fences, no extra prose) and match the schema exactly. No client-side
// repairs, so a bad answer is visible and triggers the retry.

export const VERDICTS = ["scam", "suspicious", "safe"] as const;
export const SCAM_TYPES = [
  "fake_kyc",
  "collect_request",
  "fake_refund",
  "lottery",
  "job_offer",
  "impersonation",
  "otp_phishing",
  "other",
  "none",
] as const;
export const LANGUAGES = ["en", "hi", "hinglish"] as const;

export type Verdict = (typeof VERDICTS)[number];
export type ScamType = (typeof SCAM_TYPES)[number];
export type Language = (typeof LANGUAGES)[number];

export interface Classification {
  verdict: Verdict;
  confidence: number;
  scam_type: ScamType;
  language: Language;
}

export interface RedFlag {
  flag: string;
  evidence: string;
  why_risky: string;
}

export interface Advice {
  summary: string;
  do_now: string[];
  never_do: string[];
  report: string;
}

function parseStrict(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  isStr(v) && (list as readonly string[]).includes(v);

export function parseClassification(text: string): Classification | null {
  const v = parseStrict(text);
  if (!isObj(v)) return null;
  const { verdict, confidence, scam_type, language } = v;
  if (!oneOf(VERDICTS, verdict) || !oneOf(SCAM_TYPES, scam_type) || !oneOf(LANGUAGES, language)) {
    return null;
  }
  if (typeof confidence !== "number" || confidence < 0 || confidence > 100) return null;
  return { verdict, confidence: Math.round(confidence), scam_type, language };
}

export function parseRedFlags(text: string): RedFlag[] | null {
  const v = parseStrict(text);
  if (!Array.isArray(v)) return null;
  const flags: RedFlag[] = [];
  for (const item of v) {
    if (!isObj(item) || !isStr(item.flag) || !isStr(item.evidence) || !isStr(item.why_risky)) {
      return null;
    }
    flags.push({ flag: item.flag, evidence: item.evidence, why_risky: item.why_risky });
  }
  return flags;
}

export function parseAdvice(text: string): Advice | null {
  const v = parseStrict(text);
  if (!isObj(v)) return null;
  const { summary, do_now, never_do, report } = v;
  const strList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
  if (!isStr(summary) || !strList(do_now) || !strList(never_do) || !isStr(report)) return null;
  return { summary, do_now, never_do, report };
}

const normalize = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** True when the quoted evidence really appears in the message (ignoring case and whitespace). */
export function isGrounded(evidence: string, message: string): boolean {
  const e = normalize(evidence);
  return e.length > 0 && normalize(message).includes(e);
}
