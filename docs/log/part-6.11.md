# Part 6.11 — Score honesty + calibration from stored competition checks

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-014. Does not wait for 3.11's PDFMinter file

## 2026-11-13: done

DEC-014. Does not wait for 3.11's PDFMinter file.

- **Market score** (`lib/scoring/scoring.ts`, `types.ts`): demand comes from four observed quantities
  that do not grow with the fetch limit: median reactions of a discussion, highest Google Trends
  interest, share of question phrasings, number of source types (weights 35 / 35 / 15 / 15;
  engagement and Trends are skipped when not observed). `lib/sources/engagement.ts` names the
  engagement keys per source (reddit and youtube: `upvotes`, `comments`; Trends: `avg_interest`,
  `interest_value`, never a rising row's growth %). The old code summed every number in
  `engagement` (positions, window sizes, ratios) and gave 7 points per signal up to 70.
- Problem frequency is the market's share of the run's clustered signals (1.0 at 25 %), not
  `count / 10`. Buyer intent is the mean over analysed signals only, with `analysedCount`; no
  analysed signal means 0. `CompetitiveDensity` is removed from the formula, the types, the docs
  and `/api/cluster` (it was never fed, always 1.0). The result carries `demandBasis`.
- **Trend** (`lib/cluster/summarizer.ts`): read from observed Trends rows (rising related query or
  rising summary = accelerating, falling = declining, a Trends row without direction = stable, no
  Trends row = unknown). Before, any Trends row made the cluster "accelerating" and multiplied the
  score by 1.35. Run signals now carry `engagement` into clustering (`run-signals.ts`,
  `service-deps.ts`); before, Deep runs scored with no engagement at all.
- **UI**: the market page card shows the signal counts first ("n analysed of m, from k sources")
  and the "Demand index (rule-based)" second; the explorer column reads "Demand index".
- **Calibration** (`docs/research/2026-11-13-score-calibration.md`): 30 phrases across 5 seeds
  (budgeting, meal prep, home workout, resume writing, wedding planning), one stored competition
  check each (28 new, 2 already stored, about 89 Serper calls; balance was 2441 before). Spearman
  against listings showing reviews / review total: demand 0.53 / 0.18, PDF fit -0.15 / -0.25,
  opportunity 0.22 / -0.11, confidence -0.02 / -0.16. Demand tick (≥ 50) kept: pass group median 7
  reviewed listings against 4. Competition tick changed from ≤ 10 to ≤ 5 listings with reviews:
  the old cut passed 29 of 30; 5 is the sample median. Fit threshold and the verdict thresholds
  are not supported by this data and stay `shortcut:`. Reviews are a proxy for sales, not sales.
- **Acceptance**: unit test: demand at limit 25 against limit 50 on a ranked fixture differs by
  less than 10 %. Stored rows (read-only): the demand index over each source's top half of rows
  and over all rows of two stored runs was identical (budgeting 72 / 72, meal prep 77 / 77).
- 324/324 tests (8 new: 5 score honesty, 3 observed trend), lint, typecheck, `next build` green.
- Not checked in a browser: the market page card and the explorer header after the label change
  (typecheck and build only). Not observed live: a Deep run scored with the new formula (DEC-015).
- Observations: stored markets keep scores from the old formula until a run rewrites them; idea
  scores (`lib/ideas/ideas.ts`) were measured, not changed.
