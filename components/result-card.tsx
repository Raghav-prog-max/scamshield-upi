import type { AnalyzeSuccess } from "@/lib/api-types";
import { highlightSegments } from "@/lib/highlight";
import type { ScamType, Verdict } from "@/lib/schemas";

const VERDICT_STYLE: Record<Verdict, { label: string; badge: string; bar: string; ring: string }> = {
  scam: { label: "Scam", badge: "bg-red-600 text-white", bar: "bg-red-600", ring: "ring-red-200" },
  suspicious: {
    label: "Suspicious",
    badge: "bg-amber-500 text-white",
    bar: "bg-amber-500",
    ring: "ring-amber-200",
  },
  safe: { label: "Looks safe", badge: "bg-emerald-600 text-white", bar: "bg-emerald-600", ring: "ring-emerald-200" },
};

const SCAM_TYPE_LABEL: Record<ScamType, string> = {
  fake_kyc: "Fake KYC / account block",
  collect_request: "UPI collect request",
  fake_refund: "Fake refund / cashback",
  lottery: "Lottery / prize",
  job_offer: "Fake job offer",
  impersonation: "Impersonation",
  otp_phishing: "OTP / PIN phishing",
  other: "Other scam",
  none: "No scam pattern",
};

const LANGUAGE_LABEL = { en: "English", hi: "Hindi", hinglish: "Hinglish" } as const;

export function ResultCard({ result, message }: { result: AnalyzeSuccess["result"]; message: string }) {
  const { classification: c, red_flags, advice, meta } = result;
  const style = VERDICT_STYLE[c.verdict];
  const segments = highlightSegments(
    message,
    red_flags.map((f) => f.evidence),
  );

  return (
    <section
      aria-live="polite"
      className={`rounded-2xl bg-white p-5 shadow-sm ring-2 sm:p-6 ${style.ring}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-4 py-1.5 text-base font-bold uppercase tracking-wide ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-sm text-slate-600">
          {SCAM_TYPE_LABEL[c.scam_type]} · {LANGUAGE_LABEL[c.language]}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Confidence</span>
          <span className="font-semibold text-slate-900">{c.confidence}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-slate-100">
          <div className={`h-2 rounded-full ${style.bar}`} style={{ width: `${c.confidence}%` }} />
        </div>
      </div>

      <p className="mt-5 text-lg leading-relaxed text-slate-900">{advice.summary}</p>

      {red_flags.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Red flags ({red_flags.length})
          </h3>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {segments.map((s, i) =>
              s.hit ? (
                <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
          <ol className="mt-3 space-y-3">
            {red_flags.map((f, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">
                  {i + 1}. {f.flag}
                </p>
                <p className="mt-1 text-sm">
                  <mark className="rounded bg-yellow-200 px-1 text-slate-900">“{f.evidence}”</mark>
                </p>
                <p className="mt-1 text-sm text-slate-600">{f.why_risky}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-emerald-50 p-4">
          <h3 className="font-semibold text-emerald-800">Do now</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-emerald-950">
            {advice.do_now.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-red-50 p-4">
          <h3 className="font-semibold text-red-800">Never do</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-red-950">
            {advice.never_do.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>✗</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {advice.report && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
          <span className="font-semibold">Report: </span>
          {advice.report}
        </p>
      )}

      <p className="mt-5 text-xs text-slate-400">
        {meta.model} · {(meta.total_ms / 1000).toFixed(1)} s · attempts P1 {meta.attempts.P1 ?? "-"}, P2{" "}
        {meta.attempts.P2 ?? "-"}, P3 {meta.attempts.P3 ?? "-"}
        {meta.ungrounded_flags_removed > 0 &&
          ` · ${meta.ungrounded_flags_removed} unquoted flag(s) removed`}
      </p>
    </section>
  );
}
