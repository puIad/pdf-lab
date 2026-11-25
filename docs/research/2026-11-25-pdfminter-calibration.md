# Score calibration against a PDFMinter scan (2026-11-25, Part 3.11, defect #43)

Follows `2026-11-13-score-calibration.md`. It settles what that note left open: the PDF fit
threshold, the Validate verdict thresholds, and whether the opportunity score adds anything over
demand. **Result: the evidence supports no threshold change.** Every threshold stays as it is, and
the `shortcut:` comments now say what was tested instead of "refit in 3.11".

## What was measured

1. **Cross-check against PDFMinter** (DEC-010 item 15: PDFMinter is a cross-check, not the target).
   The owner exported PDFMinter's scan for five seeds (US, 150 ideas each, none errored). PDF Lab
   ran the same five seeds through the production path of `POST /api/ideas` (`runIngest` with
   Serper People-also-ask and related searches, Google Trends and Wikipedia, then `buildIdeas`),
   on 2026-11-25. The raw export is third-party data and stays out of git; only the derived numbers
   below are committed.
2. **Marketplace outcomes** (the calibration target). Six phrases per seed, evenly spaced over
   PDF Lab's opportunity ranking, 30 phrases in all. One competition check each (Etsy, Gumroad,
   Amazon KDP, 10 results each). 26 checks were new (about 78 Serper calls), 4 were already
   stored. Scores are the current ones, so this sample is not pooled with the 30 phrases of the
   2026-11-13 note, which were scored by an earlier version.

**Reviews are a proxy for sales, not sales.** "Listings showing reviews" counts results where
Google shows a review count (an established seller). A Google result page is not a marketplace's
own ranking.

## Cross-check: PDF Lab and PDFMinter, per seed

Matched means the same phrase appears in both lists. PDFMinter lists 150 ideas per seed, PDF Lab
only phrases it stored evidence for.

| Seed | PDF Lab ideas | Matched | Rho demand | Rho fit | Rho opportunity | PDF Lab fit ≥ 60 | PDFMinter fit ≥ 60 |
|---|---|---|---|---|---|---|---|
| budgeting | 35 | 9 | 0.85 | 0.16 | 0.33 | 9 of 35 | 150 of 150 |
| meal prep | 19 | 7 | 0.56 | 0.68 | 0.49 | 7 of 19 | 150 of 150 |
| keto diet | 34 | 12 | 0.84 | 0.98 | 0.05 | 15 of 34 | 83 of 150 |
| toddler sleep | 32 | 9 | 0.21 | 0.82 | 0.28 | 13 of 32 | 63 of 150 |
| pc troubleshooting | 14 | 6 | 0.77 | n/a | 0.49 | 4 of 14 | 42 of 150 |
| all five | 134 | 43 | 0.64 | 0.28 | 0.37 | 48 of 134 (36%) | 488 of 750 (65%) |

(Spearman. "n/a": all six matched PDF Lab fit values were equal, so there is no ranking.)

- Demand agrees reasonably across the two tools (0.64 over 43 matched phrases). Both read the same
  kind of evidence (suggestions, rank, Trends), so agreement shows the formula is not off, not that
  it is right.
- Fit does not agree (0.28) and PDFMinter's fit cannot serve as a target. It is a format score
  that gives 80 to most of a seed's phrases (budgeting: all 150 at 60 or above, in bands of 60 to
  95). It does not separate good from bad phrases there, so a threshold fitted to it would fit
  its saturation. PDF Lab's fit spreads over 15, 50, 60, 65, 70.
- The two tools list different phrases. PDFMinter top phrases are product terms ("budgeting apps",
  "meal prep containers"); PDF Lab's are questions and "what is" phrases from People-also-ask.
  That is a difference in phrase source, not a scoring fault, and not something a threshold fixes.

## Marketplace outcomes, 30 phrases (rescored)

Spearman against listings with reviews / total review count, with a bootstrap 90% interval
(2000 resamples) for the first:

| Score | vs listings with reviews | 90% interval | vs review total |
|---|---|---|---|
| Demand | 0.20 | -0.18 to 0.50 | -0.00 |
| PDF fit | 0.19 | -0.20 to 0.55 | -0.09 |
| Opportunity | 0.23 | -0.18 to 0.56 | 0.00 |

Ticks (pass / fail, median listings with reviews pass / fail):

| Tick | Pass | Fail | Median with reviews (pass / fail) |
|---|---|---|---|
| Demand ≥ 50 | 15 | 15 | 6 / 6 |
| PDF fit ≥ 60 | 9 | 21 | 7 / 6 |
| Opportunity ≥ 50 | 14 | 16 | 6.5 / 6 |
| Competition ≤ 5 with reviews | 9 | 21 | n/a |

Listings with reviews, sorted: 1, 1, 2, 2, 2, 3, 4, 4, 5, then nine 6s, 7, 7, 7, 7, 8, 8, 8, 9, 10,
10, 12, 15. Median 6.

## What the data supports

- **PDF fit threshold: no change (stays 60).** Fit has rho +0.19 here and -0.15 in the 2026-11-13
  sample: zero in both, with an interval that spans zero. No cut of 15, 50, 60, 65 or 70 separates
  phrases that sit in markets with more reviewed sellers (median 7 against 6 at 60). The cross-check
  cannot move it either, because PDFMinter's fit is saturated. Nothing argues for another value, so
  60 is kept as the cut between "format suits the phrase" (65, 70) and the neutral default (50).
- **Demand threshold: stays 50, with less support than before.** The first sample gave rho 0.53;
  this one gives 0.20 (interval -0.18 to 0.50). The two samples were scored by different versions
  and are different phrase sources, so they are not pooled. The tick does not hurt, and the
  matched-phrase agreement with PDFMinter is 0.64.
- **Opportunity adds nothing over demand.** 0.23 against 0.20 here, 0.22 against 0.53 before.
  Inside PDF Lab it tracks demand closely (rho 0.77, 0.90, 0.89, 0.80, 0.39 per seed), so it is
  mostly a rescaled demand. It is kept as the ranking: it does no harm, and removing it changes the
  product without evidence that doing so is better. The tooltip text "uncalibrated" now says what
  was tested.
- **Competition tick: stays at 5.** Combined with the 2026-11-13 sample (30 phrases, median 5.5),
  "at most 5" passes 24 of 60 (40%) and "at most 6" passes 34 of 60 (57%). Neither splits the
  sample in half, and moving the cut by one is fitting to noise. Still a relative cut, not
  validated against sales.
- **Verdict thresholds (Validate): cannot be calibrated from this file, no change.** The verdict
  reads stored discussion counts, analysed buyer-intent shares, observed competitor counts and Trends
  windows from a market overview. The PDFMinter scan has none of these per phrase (it has demand,
  fit, opportunity and a topic trend line). A threshold on discussion counts has no outcome to be
  fitted against here, so the numbers stay first guesses. What would settle them: verdicts for
  about 30 concepts, each with a marketplace outcome from a competition check, which costs about 90
  Serper calls on top of the Deep or Validate runs themselves.

## Limits

- 30 phrases is small. A rho near 0.2 at n = 30 cannot be told apart from zero; the intervals above
  show it. "No effect found" here means "not measurable at this size", not "none".
- Phrases come from People-also-ask, so many are questions ("what is budgeting"). Marketplaces
  answer them with product listings that mention the topic, so the reviews proxy is noisy.
- A check reads 10 Google results per marketplace, so listings saturate near 30 and are not used.
- Serper results are those of the day (2026-11-25). Re-running changes some phrase lists.
