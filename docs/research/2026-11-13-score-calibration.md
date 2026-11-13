# Score calibration from stored competition checks (2026-11-13, Part 6.11)

## What was measured

Part 3.11 waits for a PDFMinter scan file. This note uses data the project controls instead: the
Part 3.9 competition checks. For 30 phrases across 5 seeds, each idea score was compared with what
the marketplaces showed for that phrase.

- Seeds (US region, production phrase source: Serper People-also-ask and related searches, plus
  Google Trends): budgeting, meal prep, home workout, resume writing, wedding planning.
- Six phrases per seed, evenly spaced over the opportunity ranking, so high and low scores are both
  in the sample.
- Per phrase, one competition check: Etsy, Gumroad and Amazon KDP, 10 results each.
- Cost: about 89 Serper calls. 28 checks were new, 2 were already stored.

**Reviews are a proxy for sales, not sales.** "Listings showing reviews" counts results where
Google shows a review count, which marks an established seller. "Review total" sums those counts.
Neither is revenue, and a Google result page is not a marketplace's own ranking.

## Data

| Seed | Phrase | Opportunity | Demand | Fit | Listings | With reviews | Review total |
|---|---|---|---|---|---|---|---|
| budgeting | what is budgeting | 76 | 81 | 70 | 30 | 15 | 286 |
| budgeting | budgeting tools | 58 | 65 | 50 | 30 | 5 | 98 |
| budgeting | budgeting methods | 47 | 44 | 50 | 30 | 2 | 48 |
| budgeting | why is it important to create a budget even… | 42 | 0 | 70 | 30 | 3 | 218 |
| budgeting | common budgeting mistakes | 33 | 0 | 50 | 30 | 1 | 2 |
| budgeting | free budgeting app | 14 | 14 | 15 | 25 | 8 | 603 |
| meal prep | meal prep ideas | 84 | 100 | 65 | 30 | 7 | 131 |
| meal prep | why meal prep is bad | 61 | 53 | 70 | 30 | 4 | 228 |
| meal prep | protein meal prep | 53 | 55 | 50 | 30 | 5 | 170 |
| meal prep | high protein meal prep | 42 | 36 | 50 | 30 | 4 | 167 |
| meal prep | cheap flights new york | 38 | 0 | 50 | 20 | 0 | 0 |
| meal prep | remote jobs hiring | 38 | 0 | 50 | 29 | 2 | 16 |
| home workout | home workout routines | 78 | 100 | 50 | 30 | 7 | 319 |
| home workout | home workout for women | 53 | 47 | 60 | 30 | 3 | 129 |
| home workout | home workout meaning | 34 | 50 | 15 | 29 | 9 | 644 |
| home workout | home workout equipment | 30 | 13 | 50 | 26 | 4 | 431 |
| home workout | sports scores today | 26 | 6 | 50 | 22 | 4 | 21 |
| home workout | best restaurants near me | 10 | 6 | 15 | 27 | 9 | 1570 |
| resume writing | resume writing help | 78 | 100 | 50 | 29 | 10 | 142 |
| resume writing | how to make a resume for first job | 64 | 59 | 70 | 29 | 4 | 29 |
| resume writing | resume writing tips | 57 | 63 | 50 | 28 | 4 | 121 |
| resume writing | best ai for resume writing | 47 | 44 | 50 | 29 | 8 | 137 |
| resume writing | what other information about a job can you… | 34 | 4 | 70 | 30 | 2 | 5 |
| resume writing | best restaurants near me | 10 | 6 | 15 | 27 | 9 | 1570 |
| wedding planning | wedding checklist | 84 | 100 | 65 | 30 | 10 | 570 |
| wedding planning | wedding planning checklist | 63 | 62 | 65 | 30 | 9 | 966 |
| wedding planning | wedding timeline | 51 | 52 | 50 | 29 | 9 | 827 |
| wedding planning | checklist for wedding planning | 42 | 24 | 65 | 30 | 9 | 2119 |
| wedding planning | wedding planning movie | 38 | 56 | 15 | 30 | 6 | 289 |
| wedding planning | wedding planning app | 23 | 29 | 15 | 28 | 7 | 382 |

## Rank correlation (Spearman, n = 30)

| Score | vs listings with reviews | vs review total |
|---|---|---|
| Demand | 0.53 | 0.18 |
| PDF fit | -0.15 | -0.25 |
| Opportunity | 0.22 | -0.11 |
| Confidence | -0.02 | -0.16 |

## Ticks

| Tick | Pass | Fail | Median with reviews (pass / fail) | Median review total (pass / fail) |
|---|---|---|---|---|
| Demand ≥ 50 | 14 | 16 | 7 / 4 | 286 / 167 |
| PDF fit ≥ 60 | 10 | 20 | 7 / 6 | 228 / 170 |
| Competition ≤ 10 with reviews | 29 | 1 | 5 / 15 | 170 / 286 |

Listings with reviews, sorted: 0, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 6, 7, 7, 7, 8, 8, 9, 9, 9,
9, 9, 9, 10, 10, 15. Median 5.5.

## What the data supports

- **Demand tracks established sellers.** Rho 0.53 against listings with reviews, and the phrases
  passing the demand tick sit in markets with more reviewed listings (median 7 against 4). The
  demand tick keeps its threshold of 50.
- **PDF fit does not track the proxy.** Slightly negative on both columns. That is not proof the
  fit score is wrong: reviews measure what sells on three marketplaces, fit measures whether a
  phrase suits a PDF. The fit threshold stays a `shortcut:` guess.
- **The opportunity score adds nothing over demand** on this proxy (0.22 and -0.11). It mixes
  demand with fit, and fit pulls it down.
- **Confidence is unrelated to the proxy**, as it should be: it counts independent sources.
- **The competition tick did not discriminate.** With "at most 10 listings showing reviews", 29 of
  30 phrases passed. It is changed to "at most 5", the sample median, which splits the sample in
  half. That makes the tick informative; it is still a relative cut, not one validated against
  sales, so it stays marked `shortcut:`.

## Limits

- 30 phrases is a small sample. A rho of 0.53 at n = 30 is a real signal; 0.22 is not
  distinguishable from zero.
- Off-topic phrases came through Google Trends related queries ("cheap flights new york", "best
  restaurants near me", "sports scores today", "remote jobs hiring"). They score low on demand and
  were kept in the sample because the scan shows them to users too. "best restaurants near me"
  appears under two seeds with the same stored check.
- A check reads the first 10 Google results per marketplace, so "listings" saturates near 30 and is
  not used.
- The verdict thresholds in `lib/planner/verdict.ts` read different counts (stored discussions,
  analysed intent) and are not covered here. They stay `shortcut:`.

## Market score (Deep runs)

The same part changed the market score (`lib/scoring/scoring.ts`, see `05-PIPELINE-SCORING.md`).
Its acceptance was checked on stored rows: for the signals of two stored runs, the demand index
over each source's top half of rows and over all rows was the same (budgeting 72 and 72, meal
prep 77 and 77). Both runs had no discussion source with reactions, so the index rested on Trends
interest, question share and source count.
