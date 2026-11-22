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
