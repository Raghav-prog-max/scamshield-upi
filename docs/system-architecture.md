# System architecture

```mermaid
flowchart LR
    subgraph Client [Browser]
        UI["app/page.tsx<br/>components/analyzer.tsx<br/>components/result-card.tsx"]
        VAL1["lib/validate-input.ts"]
        UI --- VAL1
    end

    subgraph Vercel [Vercel · Next.js 16 App Router]
        ROUTE["app/api/analyze/route.ts<br/>(Node.js function, maxDuration 60 s)"]
        VAL2["lib/validate-input.ts"]
        PIPE["lib/pipeline.ts<br/>P1 → P2 → P3 + retry"]
        PROMPTS["lib/prompts.ts<br/>loads + fills templates"]
        FILES[("prompts/final/<br/>P1.md · P2.md · P3.md<br/>(bundled via outputFileTracingIncludes)")]
        SCHEMA["lib/schemas.ts<br/>strict JSON validation<br/>+ evidence grounding"]
        GEM["lib/gemini.ts<br/>@google/genai client"]
        ENV[["GEMINI_API_KEY<br/>(env var, server only)"]]
        ROUTE --> VAL2
        ROUTE --> PIPE
        PIPE --> PROMPTS --> FILES
        PIPE --> SCHEMA
        PIPE --> GEM
        ENV -.-> GEM
    end

    subgraph Google [Google AI]
        MODEL["Gemini 2.5 Flash<br/>generateContent"]
    end

    subgraph Offline [Local only]
        RUNNER["scripts/run-tests.ts<br/>(npx tsx)"]
        INPUTS[("test-data/inputs.json")]
        OUTS[("test-data/outputs/*.json<br/>results-summary.md")]
        OLD[("prompts/v1 · v2 · v3")]
        RUNNER --> INPUTS
        RUNNER --> OLD
        RUNNER --> PIPE
        RUNNER --> OUTS
    end

    UI -- "POST JSON" --> ROUTE
    GEM -- HTTPS --> MODEL
```

## Key decisions

- **The API key never reaches the browser.** Only the server route calls Gemini, and the key is read from `process.env.GEMINI_API_KEY`.
- **Prompts are files, not strings in code.** `lib/prompts.ts` reads `prompts/final/*.md` at runtime, and the frontmatter holds temperature, JSON mode and thinking budget. `next.config.ts` → `outputFileTracingIncludes` makes Vercel bundle these files with the function.
- **No database and no login.** Messages are not stored. The only server state is an in-memory, per-instance rate limit (8 requests per minute per IP).
- **The app lives at the repo root** so Vercel deploys it with zero configuration. `code/README.md` points to the source folders.
