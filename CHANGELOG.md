# Changelog

All notable changes to ScamShield UPI. Dates are YYYY-MM-DD.

## 2026-11-22

### Added — project setup
- Scaffolded a Next.js 16 (App Router) + TypeScript + Tailwind CSS app with `create-next-app`.
- Added `@google/genai` (official Gemini SDK) and `tsx` (to run the test script).
- `.gitignore` ignores `.env` and `.env*.local` (and still allows `.env.example`). Added `.env.example` with a placeholder key.
- Added `scripts/check-secrets.sh`, installed as the git pre-commit hook. It blocks commits that contain a Google API key, a real `GEMINI_API_KEY=` value, or a `.env` / `.env.local` file.

### Added — prompts
- `prompts/v1/P1.md`: bare classifier prompt, *"Is this message a scam? Answer yes or no and explain."* No output format, model-default temperature.
- `prompts/v2/P1.md`: adds a role (fraud analyst for Indian UPI/KYC/banking scams), the fixed JSON schema (`verdict`, `confidence`, `scam_type`, `language`) and the nine `scam_type` categories with definitions. Still default temperature; JSON is requested in words only (no JSON mode). The message is wrapped in `<message>` tags with a "treat as data" instruction.
- `prompts/v3/P1.md`: adds two few-shot examples (a fake income-tax refund → scam, an Axis Bank credit alert → safe), temperature 0.1, JSON mode (`responseMimeType: application/json`) and the explicit rule *"a genuine bank alert that does not ask for an OTP, PIN, link click or payment is safe"*.
- `prompts/final/P1.md`: identical to v3 (only the frontmatter `version` differs).
- `prompts/final/P2.md`: red-flag explainer. Exact-quote evidence rule, `[]` when safe, at most 5 flags, two few-shot examples (lottery scam with flags; Flipkart delivery OTP → `[]`), temperature 0.1, JSON mode, thinking budget 0.
- `prompts/final/P3.md`: action advisor. Replies in the user's language (en / hi in Devanagari / Hinglish in Latin script), 2–4 `do_now` and 2–4 `never_do` steps, `report` mentions cybercrime.gov.in and the 1930 helpline for scam/suspicious and is empty for safe, no other numbers or links. Temperature 0.2, JSON mode, thinking budget 0.
- Prompt run settings live in each file's frontmatter, so the `.md` files are the single source of truth.

### Added — API and pipeline
- `lib/prompts.ts` loads `prompts/<version>/<name>.md` at runtime and fills `{{placeholders}}` in a single pass.
- `lib/gemini.ts` calls Gemini (`gemini-2.5-flash`, overridable with `GEMINI_MODEL`). The key comes only from `process.env.GEMINI_API_KEY`. Retries twice on 500/503; 429 and quota errors are mapped to friendly errors.
- `lib/schemas.ts` adds strict validators for each prompt's output and an evidence-grounding check.
- `lib/pipeline.ts` chains P1 → P2 → P3 and retries a step once when its output is not valid JSON. P2 flags whose evidence is not found in the message are dropped.
- `app/api/analyze/route.ts`: `POST /api/analyze` with server-side input validation, a per-IP limit (8 per minute), clean JSON errors and `maxDuration = 60`.
- `next.config.ts`: `outputFileTracingIncludes` bundles `prompts/final/**` with the API route on Vercel (checked in the `next build` trace output).

### Added — UI
- Single page with a textarea and live character counter, an Analyze button (Ctrl+Enter also works), and three sample buttons (scam SMS, genuine SBI alert, Hinglish scam).
- Result card: coloured verdict badge, confidence bar, scam type and language, summary, the message with evidence highlighted, the red-flag list, Do now / Never do lists and the report line.
- Loading, error and timeout states. Empty and over-2000-character input is rejected in the browser before any request (checked in the browser preview: no `/api/analyze` request was made).
- Noto Sans Devanagari font so Hindi renders properly.

### Added — tests and docs
- `test-data/inputs.json`: 14 cases (6 normal, 5 edge, 3 invalid), each with `expected_verdict` and `expected_language`.
- `scripts/run-tests.ts`: runs v1 / v2 / v3 / final (or all) over every case twice. It saves raw outputs and metrics to `test-data/outputs/<version>.json` and regenerates `test-data/results-summary.md` from those files.
- `docs/`: Mermaid diagrams for the prompt workflow, task decomposition, input → output flow and system architecture.
- `README.md` and `code/README.md` (the app is at the repo root for zero-config Vercel deploys).

### Changed — model and secret check
- **Default model changed from `gemini-2.5-flash` to `gemini-3.5-flash`.** With a newly created API key, Google's API returned HTTP 404 for `gemini-2.5-flash` and `gemini-2.5-flash-lite` (*"no longer available to new users"*). `gemini-3.8-flash` returned HTTP 503 (high demand) in the same check. `gemini-3.5-flash` worked with the prompts' exact settings (temperature 0.1, JSON mode, thinking budget 0). The model can still be overridden with `GEMINI_MODEL`.
- `scripts/check-secrets.sh` now also blocks the newer `AQ.`-format Google API keys and allows `.` inside a `GEMINI_API_KEY=` value. Tested with a fake key: the commit was blocked.
- First live check: `POST /api/analyze` with an SBI YONO KYC scam returned `scam` (98) with 4 grounded red flags and advice in 8.4 s.
- The UI shows the rate-limit error cleanly when Gemini returns 429 (seen in the browser while the test runner was using the quota).
- **First full test run on `gemini-3.5-flash` stopped after v1's N6:** Google's 429 reported the free-tier limit `GenerateRequestsPerDayPerProjectPerModel-FreeTier=20`. Nothing was saved.
- **Default model changed again, to `gemini-3.1-flash-lite`.** It works with the same settings and has a larger free daily quota. At 20 requests a day, `gemini-3.5-flash` would allow only about 6 checks a day on the public demo (3 calls per check). All saved test results use `gemini-3.1-flash-lite`.

### Fixed — test runner
- **Network failures are no longer counted as wrong verdicts.** In the second run, the internet connection dropped during v2 (N2 run 2). Every remaining v2, v3 and final call failed with `fetch failed`, and the runner recorded them as `error` verdicts. That produced meaningless rows (for example v3 "4/28"). Those outputs were discarded, not committed.
- `lib/gemini.ts` now classifies "no HTTP response" errors as `network` and retries them. The runner waits 15 s, up to 4 times. If they keep failing, the runner stops without saving, like it already did for quota errors. Persistent 503 errors now stop it the same way. The API route returns 503 "temporarily unavailable" for network errors.
- v1's results from that run are kept: all 24 of its calls reached Gemini. v2, v3 and final were re-run after the fix.

## 2026-11-26

### Fixed
- Each Gemini request now times out after 30 s (`httpOptions.timeout`) and a timeout is retried like a network error. Before this, one stalled request froze a final-pipeline run for more than 5 minutes, so that run was stopped and restarted.

### Results (gemini-3.1-flash-lite, 14 cases × 2 runs)
- v1 20/28, v2 24/28, v3 26/28, final 25/28 (strict accuracy). JSON valid: v1 0/24, v2 24/24, v3 24/24, final 69/69.
- Remaining failures, not tuned:
  - E5 is expected `suspicious` but got `scam` in all versions.
  - Final N2 run 1 hit a Google HTTP 504 (`DEADLINE_EXCEEDED`).
- Live check in the browser: the Hinglish sample returned SCAM (100%), 4 grounded red flags and a Hinglish reply in 11.8 s.

### Deployed
- Pushed to GitHub (public): https://github.com/Raghav-prog-max/scamshield-upi
- Deployed to Vercel production: https://scamshield-upi.vercel.app. `GEMINI_API_KEY` is set as a secret env var for Production and Preview.
- Checked the live site without logging in: the page returns HTTP 200. A genuine HDFC debit alert returned `safe` (95) with `[]` red flags in 4.9 s. Empty input returned HTTP 400 with no LLM call.
