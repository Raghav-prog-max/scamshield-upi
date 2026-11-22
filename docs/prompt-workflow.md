# Prompt workflow

How one message flows through the three chained prompts. Each step's JSON output becomes input variables for the next prompt. Every step is validated strictly and retried once if the model's output is not valid JSON.

```mermaid
flowchart TD
    A([User message]) --> V{"Input valid?<br/>not empty, ≤ 2000 chars"}
    V -- no --> VE[Friendly validation error<br/>no LLM call]
    V -- yes --> P1

    subgraph P1S [P1 · Classifier · prompts/final/P1.md]
        P1["Fill {{message}}<br/>temperature 0.1 · JSON mode<br/>2 few-shot examples"] --> P1C{Strict JSON +<br/>schema valid?}
        P1C -- no, 1st try --> P1
    end
    P1C -- yes --> O1[/verdict · confidence · scam_type · language/]

    O1 --> P2
    subgraph P2S [P2 · Red-flag explainer · prompts/final/P2.md]
        P2["Fill {{message}} {{verdict}} {{scam_type}}<br/>temperature 0.1 · JSON mode<br/>2 few-shot examples"] --> P2C{Strict JSON array?}
        P2C -- no, 1st try --> P2
    end
    P2C -- yes --> G[Grounding check:<br/>drop any flag whose evidence<br/>is not a substring of the message]
    G --> O2[/red_flags: flag · evidence · why_risky/]

    O1 --> P3
    O2 --> P3
    subgraph P3S [P3 · Action advisor · prompts/final/P3.md]
        P3["Fill {{verdict}} {{scam_type}} {{red_flags}} {{language}}<br/>temperature 0.2 · JSON mode"] --> P3C{Strict JSON +<br/>schema valid?}
        P3C -- no, 1st try --> P3
    end
    P3C -- yes --> O3[/summary · do_now · never_do · report<br/>in the user's language/]

    P1C -- no, 2nd try --> ERR["Clean error:<br/>AI gave an unreadable answer"]
    P2C -- no, 2nd try --> ERR
    P3C -- no, 2nd try --> ERR

    O3 --> R([Result card])
```

## P1 iteration history

```mermaid
flowchart LR
    v1["v1 · bare<br/>'Is this a scam? yes/no + explain'<br/>default temperature, free text"]
    v2["v2 · + role<br/>+ fixed JSON schema<br/>+ scam_type categories<br/>(still default temperature, no JSON mode)"]
    v3["v3 · + 2 few-shot examples<br/>+ temperature 0.1<br/>+ JSON mode<br/>+ 'genuine bank alert is safe' rule"]
    F["final P1 = v3"]
    v1 --> v2 --> v3 --> F
```

Measured results for each version are in [`../test-data/results-summary.md`](../test-data/results-summary.md).
