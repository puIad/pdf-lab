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
- CLASSIFYING → FAILED when fewer than half of the run's discussion signals end up analysed
  (`MIN_ANALYZED_SHARE` in `lib/runs/orchestrator.ts`, Part 6.9). Above that share the run goes
  on and is marked partial: the trace and the completeness panel give analysed, not analysed and
  not clustered (no embedding) counts.

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
score = Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability
```

Part 6.11 (`lib/scoring/scoring.ts`): the score is a rule-based index, not a measurement.

- **Demand (0..100)** comes from four observed quantities that do not grow with the fetch limit:
  the median reactions of a discussion (only the engagement keys named per source in
  `lib/sources/engagement.ts`), the highest Google Trends interest among the market's Trends rows,
  the share of question phrasings, and the number of source types (capped at 3). Weights 35 / 35 /
  15 / 15. Engagement and Trends are left out when not observed, never counted as zero.
- **ProblemFrequency** is the market's share of the run's clustered signals (1.0 at 25 %).
- **BuyerIntent** is the mean over analysed signals only, reported with "n analysed of m". No
  analysed signal means intent is not observed and the score is 0.
- **TrendMomentum** uses a trend read from observed Trends rows (rising, falling, present, or
  none = unknown) and validated under QC Rule 2 before it is stored.
- **CompetitiveDensity was removed.** It was never fed and always 1. Competition is shown as raw
  stored listing counts (DEC-010), not folded into the score.
- UI order: the raw counts first, the index second and labeled as rule-based.
- Weights and thresholds are `shortcut:` guesses until calibrated; see
  `docs/research/2026-11-13-score-calibration.md`.

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
