# Part 6.8 — Evidence that belongs to the opportunity

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-014. Code and unit acceptance done; the "in a completed run" check waits on a live Deep run (DEC-015). `lib/opportunities/match.ts`: an opportunity cites the market's signals that speak about its problem: the signals it was built from, then the others ranked by embedding similarity to their centroid (kept at cosine ≥ 0.8), or, when an embedding is missing, by the share of the problem's own words found in the signal (≥ 0.5; PR #13 review: the first version used jaccard, which a long post title pushed under the bar even for a word-for-word problem); at most 5 rows, and the count of all matches is kept. Checked on stored rows (no model): in "Personal Budgeting Toolkit" (58 signals, pairwise cosine p50 0.67, p90 0.81) the candidate about free budgeting apps matches 16 of 58, all "budgeting app" rows; "budgeting advance" matches 4 of 58; counts range 1 to 20. AI path: a model candidate's own signals are those of its audience that share words with its problem wording; none means it is skipped. `distinctEvidenceSets`: two different problems never cite the identical signal set in a market of more than 3 signals (the later one keeps only its own signals, or is dropped when those are taken). QC Rule 1 (`lib/evidence/qc.ts`): a row counts only with a `source_id` and a url or excerpt (`sourcedEvidenceCount`); the generator filters such candidates out before selection and the orchestrator drops them instead of failing the run (`opportunitiesDroppedUnsourced` in the trace, which includes the generator's own count since the PR #13 review). QC Rule 4 gets the matching-signal count, not the number of attached rows. `signalType` is `pain_point` only when extraction stored a problem, else the source type (`evidenceSignalType`), for market and opportunity evidence. Migration `20261113000007_opportunity_match_counts.sql` applied live: `opportunities.matching_signals`, `market_signal_count` (nullable; a column was chosen over parsing claim text, `04-SCHEMA.md` updated); the opportunity page shows "N of M discussions in this market mention this problem" when both are set. Quick-idea candidates carry their phrase-row count and no market total. 298/298 tests (12 new: 3 in `match.test.ts`, 6 in the generator suite, stricter Rule 1 negatives, orchestrator drop and Rule 4 failure), lint, typecheck, `next build` green 2026-11-13. NOT observed live: a saved opportunity with the two counts and the page line (no run completes, DEC-015). Observations: (1) the finding's "directly addresses market cluster" row no longer exists in the code (removed in 6.4); it is covered as a negative test; (2) most stored budgeting signals are Trends "Related query" rows, so their "discussions" are search phrases (→ 6.11 demand sources).

## 2026-11-15: live check on two completed pasted runs

Same two runs as the 6.7 check ("meal prep" `c638c48d`, "home workout" `7963555f`), recounted
with PostgREST. Pasted runs store no embeddings, so only the word-match path ran; the
embedding path is still not observed live.

- Sourced evidence: 0 of 25 and 0 of 25 opportunities lack a row with a `source_id` and a url or
  excerpt. The trace reports `opportunitiesDroppedUnsourced: 0`. Rows per opportunity: 1 to 5.
- Distinct sets: in markets with more than 3 signals, no two opportunities with different
  problems cite an identical evidence set (0 pairs in both runs).
- Counts: `matching_signals` is set on all 50. `market_signal_count` is set on 13 and 16; the
  rest are quick-idea candidates, which carry no market total by design (9 in "home workout",
  equal to the trace's `opportunitiesFromIdeas: 9`). The opportunity page shows "4 of 7
  discussions in this market mention this problem" for a stored opportunity, and no such line
  for a quick-idea one.
- Evidence type: market and observed-pool rows read `pain_point` (every analysed signal has a
  problem); quick-idea rows read `frequency`.

Findings, both listed as open defects in STATE:

1. The word match counts the seed's own words. A short problem ("They look for ways to meal
   prep chicken.") reaches the 0.5 bar on "meal" and "prep" alone, so it matches every signal of
   its market: "Meal prep recipe ideas" has four opportunities at 6 of 6, "Home workout
   equipment" six at 6 of 6. Their evidence sets differ by one row out of five, which satisfies
   the acceptance wording but not its intent.
2. Quick-idea opportunities are filed under the wrong market. `marketFor`
   (`lib/opportunities/from-ideas.ts`) uses jaccard against all of a market's text, so the
   market with the least text wins: 10 general ideas ("How to Meal Prep for Beginners", "The
   Meal Prep Planner") sit under "Vegetarian meal prep" (1 signal); "8 Week Workout Plan At Home"
   sits under "Home workout bench". Their evidence is their own phrase rows, so this is a
   filing error, not an evidence error.
