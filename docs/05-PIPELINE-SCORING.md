# 05 — PIPELINE, LIFECYCLE & SCORING (PRD §16, §38–§39, §52–§55)

## Research-run lifecycle (PRD §38) — normative state machine

```text
QUEUED → COLLECTING → NORMALIZING → CLASSIFYING → CLUSTERING → TREND_ANALYSIS
  → COMPETITION_ANALYSIS → OPPORTUNITY_GENERATION → REPORT_GENERATION → COMPLETED
   (any state → FAILED with error + partial-evidence pointer)
```

- `research_runs.status` holds lowercase form. UI MUST expose progress (PRD §38-final).
- Each transition writes evidence/counts; a run that reaches COMPLETED without stored
  evidence rows is a bug, not a success.

## Deep-research pipeline (PRD §39) — the 9 phases every `pdf-lab <niche>` run executes

1. Candidate generation — broad candidate submarkets for the niche.
2. Evidence collection — multi-source search (adapters from `08-ADAPTERS.md`).
3. Signal extraction — pain/intent/audience/urgency/pdf_relevance per signal (§13–§14).
4. Trend calculation — compare 7d / 30d / 90d+12m windows (§22–§23).
5. Competition — find existing PDF products (§20).
6. Market gaps — review mining → unmet needs (§21).
7. Opportunity generation — 50 candidates → 25 distinct (§29).
8. Evidence-backed ranking — score + confidence + evidence_count (§16).
9. Final report — human-readable research page (§19, §47).

## First MVP algorithm (PRD §52) — normative until Phase 6

```text
INPUT niche → 50 candidate problems → search web+Reddit each → collect evidence
→ dedup → cluster → compute frequency|recency|trend|buyer-intent|pdf-suitability|competition
→ 50 opportunities → select 25 distinct → report
```

## Opportunity score (PRD §16) — concept formula + storage rule

```text
score = Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability ÷ CompetitiveDensity
```

- Never display as pseudo-science: ALWAYS store/show the triple
  `{ opportunity_score, confidence (0..1), evidence_count }`.
- No "High demand" string without the counts behind it (PRD §53 Rule 4).
- Trend labels restricted to `emerging|accelerating|seasonal|stable|declining|unknown`
  with temporal evidence attached (PRD §23, §53 Rule 2).

## Quality-control rules (PRD §53) — enforced in code from Phase 1 Part 1.5

1. No opportunity without evidence.
2. No trend claim without temporal evidence.
3. No competition claim without observed competitors.
4. No "high demand" from AI opinion alone.
5. Separate observed facts vs AI interpretation vs product suggestion — in schema
   (`evidence` vs analysis fields vs `opportunities.solution`) AND in UI.

## Confidence + completeness display (PRD §54–§55)

- Every conclusion: `Label + Confidence% + Based on N signals over D days from S sources`
  (or `Uncertain + reason`, e.g. insufficient history).
- Every completed run: completeness panel — sources covered, signals analyzed, markets
  identified, opportunities generated, evidence-backed count.
