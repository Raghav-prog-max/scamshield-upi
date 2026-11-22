import { Analyzer } from "@/components/analyzer";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">ScamShield UPI</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Is this message a scam?
        </h1>
        <p className="mt-2 text-slate-600">
          Paste a suspicious SMS, WhatsApp or email in English, Hindi or Hinglish. We&apos;ll check it for
          UPI, KYC and banking scam patterns, show the red flags and tell you what to do next.
        </p>
      </header>

      <Analyzer />

      <footer className="mt-10 text-xs leading-relaxed text-slate-500">
        ScamShield is an AI prototype (Google Gemini) and can be wrong. Never share your OTP, UPI PIN or
        passwords with anyone. Lost money to fraud? Call <strong>1930</strong> or report at{" "}
        <a className="underline" href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">
          cybercrime.gov.in
        </a>
        . Messages you paste are sent to Google Gemini for analysis and are not stored by this app.
      </footer>
    </main>
  );
}
