# Input → output flow

What the user sends, what each stage receives and returns, and what comes back to the browser.

```mermaid
sequenceDiagram
    actor U as User
    participant B as Browser (components/analyzer.tsx)
    participant API as POST /api/analyze
    participant PL as lib/pipeline.ts
    participant G as Gemini 3.1 Flash Lite

    U->>B: Paste message, click Analyze
    B->>B: validateInput(): empty? > 2000 chars?
    alt invalid
        B-->>U: Friendly error (no request sent)
    else valid
        B->>API: { "message": "..." }
        API->>API: validateInput() again + per-IP limit
        API->>PL: analyzeMessage(message)
        PL->>G: P1 prompt with {{message}}
        G-->>PL: {"verdict","confidence","scam_type","language"}
        Note over PL: strict JSON check, retry once if invalid
        PL->>G: P2 prompt with {{message}} {{verdict}} {{scam_type}}
        G-->>PL: [{"flag","evidence","why_risky"}, ...]
        Note over PL: drop flags whose evidence is not in the message
        PL->>G: P3 prompt with {{verdict}} {{scam_type}} {{red_flags}} {{language}}
        G-->>PL: {"summary","do_now","never_do","report"}
        PL-->>API: classification + red_flags + advice + meta
        API-->>B: { ok: true, result }
        B-->>U: Result card
    end
    opt any step fails twice / rate limit / missing key
        API-->>B: { ok: false, code, error }
        B-->>U: Clean error message
    end
```

## Example

**Input**

```json
{ "message": "Priya grahak, aapka KYC expire ho gaya hai, turant link pe click karo ..." }
```

**Output** (shape; real outputs are saved in `test-data/outputs/final.json`)

```json
{
  "ok": true,
  "result": {
    "classification": { "verdict": "scam", "confidence": 95, "scam_type": "fake_kyc", "language": "hinglish" },
    "red_flags": [
      { "flag": "...", "evidence": "turant link pe click karo", "why_risky": "..." }
    ],
    "advice": { "summary": "...", "do_now": ["..."], "never_do": ["..."], "report": "..." },
    "meta": { "model": "gemini-3.1-flash-lite", "total_ms": 0, "ungrounded_flags_removed": 0, "attempts": { "P1": 1, "P2": 1, "P3": 1 } }
  }
}
```
