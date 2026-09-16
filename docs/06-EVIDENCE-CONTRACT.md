# 06 — EVIDENCE & ANTI-HALLUCINATION CONTRACT (PRD §30–§31, §53–§54)

Binding on ALL phases. Violations fail review even if the feature "works".

## Architecture (PRD §31) — the only legal data flow

```text
Sources → Raw data → Structured extraction → Aggregated statistics → AI interpretation
```

The LLM NEVER sees an empty evidence set and invents findings. If evidence is thin, the
output says so with low confidence (PRD §54) — it does not confabulate.

## Claim rules (PRD §30)

- Bad: "This market is huge."
- Good: "The system observed 312 relevant discussions across the selected sources during
  the last 90 days." (+ links)
- Every evidence record carries: `source, URL, date, excerpt, signal type, confidence`.
  (Maps to the `evidence` table in `04-SCHEMA.md`.)
- Scores are evidence-derived (PRD §7-table note), never arbitrary AI judgment.

## The five QC rules (normative, re-stated for review use)

| # | Rule | Review probe |
|---|---|---|
| 1 | No opportunity without evidence | Open any opportunity → ≥1 evidence row renders |
| 2 | No trend claim without temporal evidence | Every trend label has ≥2 time-window counts |
| 3 | No competition claim without observed competitors | Competition section empty-state says "none observed", never invents |
| 4 | No demand claim from AI opinion alone | Demand strings cite signal counts |
| 5 | Facts ≠ interpretation ≠ suggestion | UI sections labeled; schema fields separate |

## Fixture rule

Demos/seeds/fixtures MUST be labeled `fixture` in data + UI ("sample data"). Fixture counts
must never flow into scores or confidence. Remove-or-replace before MVP gate.
