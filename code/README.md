# code/ → the app lives at the repository root

The assignment asks for a `code/` folder. The Next.js app is kept at the **repository root** instead because:

- Vercel detects a Next.js app at the root and deploys it with **zero configuration**. No "Root Directory" setting is needed.
- The API route reads `prompts/final/*.md` at runtime. With the app at the root, those files sit inside the project that Vercel bundles (`outputFileTracingIncludes` in `next.config.ts`). If the app lived in `code/`, the prompts would sit outside the deployed project.

## Where the code is

| Path | What it is |
|---|---|
| [`../app/page.tsx`](../app/page.tsx) | The single page (header, footer) |
| [`../app/api/analyze/route.ts`](../app/api/analyze/route.ts) | `POST /api/analyze`: validation, rate limit, error mapping |
| [`../components/analyzer.tsx`](../components/analyzer.tsx) | Textarea, sample buttons, loading/error states (client component) |
| [`../components/result-card.tsx`](../components/result-card.tsx) | Verdict badge, highlighted evidence, do/don't lists |
| [`../lib/pipeline.ts`](../lib/pipeline.ts) | P1 → P2 → P3 chain, retry-once on invalid JSON, evidence grounding |
| [`../lib/prompts.ts`](../lib/prompts.ts) | Loads `prompts/<version>/<name>.md`, parses frontmatter, fills `{{placeholders}}` |
| [`../lib/gemini.ts`](../lib/gemini.ts) | `@google/genai` wrapper; key from `GEMINI_API_KEY` only |
| [`../lib/schemas.ts`](../lib/schemas.ts) | Output contracts + strict validators |
| [`../lib/validate-input.ts`](../lib/validate-input.ts) | Empty / > 2000-character checks (shared by browser and server) |
| [`../scripts/run-tests.ts`](../scripts/run-tests.ts) | Prompt test runner (`npx tsx scripts/run-tests.ts --version all`) |
| [`../scripts/check-secrets.sh`](../scripts/check-secrets.sh) | Pre-commit hook that blocks API keys |
