"use client";

import { useState } from "react";
import type { AnalyzeResponse, AnalyzeSuccess } from "@/lib/api-types";
import { SAMPLES } from "@/lib/samples";
import { MAX_CHARS, validateInput } from "@/lib/validate-input";
import { ResultCard } from "./result-card";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; result: AnalyzeSuccess["result"]; message: string };

export function Analyzer() {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const loading = state.status === "loading";
  const length = text.trim().length;

  async function analyze() {
    const check = validateInput(text);
    if (!check.ok) {
      setState({ status: "error", error: check.error });
      return;
    }
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: check.message }),
        signal: AbortSignal.timeout(65_000),
      });
      const data = (await res.json().catch(() => null)) as AnalyzeResponse | null;
      if (!data) throw new Error("bad response");
      if (!data.ok) {
        setState({ status: "error", error: data.error });
        return;
      }
      setState({ status: "done", result: data.result, message: check.message });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      setState({
        status: "error",
        error: timedOut
          ? "The check took too long. Please try again."
          : "Couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <label htmlFor="message" className="block font-semibold text-slate-900">
          Paste the SMS, WhatsApp or email message
        </label>
        <textarea
          id="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
          }}
          rows={6}
          placeholder="e.g. Dear customer, your KYC has expired. Click the link to update…"
          className="mt-2 w-full resize-y rounded-lg border border-slate-300 p-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <div className="mt-1 flex justify-end">
          <span className={`text-xs ${length > MAX_CHARS ? "font-semibold text-red-600" : "text-slate-500"}`}>
            {length.toLocaleString("en-IN")} / {MAX_CHARS.toLocaleString("en-IN")}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Try a sample:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={loading}
              onClick={() => {
                setText(s.text);
                setState({ status: "idle" });
              }}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-blue-400 sm:w-auto"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-2xl bg-white p-5 text-slate-700 shadow-sm ring-1 ring-slate-200">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
          Checking the message — classify, find red flags, write advice (usually 5–15 s)…
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          {state.error}
        </div>
      )}

      {state.status === "done" && <ResultCard result={state.result} message={state.message} />}
    </div>
  );
}
