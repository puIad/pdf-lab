# Validate verdict thresholds against marketplace outcomes (2026-11-26, defect #43)

Follows `2026-11-25-pdfminter-calibration.md`, which left one thing open: the Validate verdict
thresholds in `lib/planner/verdict.ts` need verdicts paired with marketplace outcomes.
**Result: the verdict thresholds cannot be fitted, and no threshold changes.** The verdict has
almost no spread to fit, and the counts it reads do not track the outcome.

## What was measured

- **Concepts:** every phrase that already has a stored competition check (Part 3.9): 60 phrases
  stored, 37 readable by `loadStoredChecks` and scored. They are the phrases of the two earlier
  calibration samples, across budgeting, meal prep, home workout, resume writing, wedding planning,
  keto diet, toddler sleep and pc troubleshooting. The cap was 30 concepts and 90 Serper calls; the
  data was already there, so this run made **0 new Serper calls** and spent nothing.
- **Verdict:** `generateMarketOverview(phrase, supabase, { mode: "validate" })` then `buildVerdict`
  (the same two calls `POST /api/research` makes for Validate), run from a script with `.env.local`
  against the stored rows, on 2026-11-26. No signed-in UI.
- **Outcome:** the stored competition check (Etsy, Gumroad, Amazon KDP, 10 results each):
  listings showing reviews (an established seller) and the review total. A proxy for sales, not
  sales, as in the earlier notes.

## Result (n = 37)

| Verdict | Concepts | Median listings with reviews | Median review total |
|---|---|---|---|
| GO | 0 | n/a | n/a |
| WAIT | 36 | 5 | 168.5 |
| KILL | 1 | 2 | 16 |

Per check:

| Check | Pass | Weak | Fail | Not observed |
|---|---|---|---|---|
| Demand (≥ 10 discussions) | 36 | 0 | 1 | 0 |
| Buyer intent (≥ 25% strong, ≥ 5 analyzed) | 0 | 31 | 0 | 6 |
| Competition (1 to 30 competitors) | 24 | 0 | 7 | 6 |
| Trend (not declining) | 36 | 0 | 0 | 1 |

Spearman of each count against listings with reviews (bootstrap 90% interval, 2000 resamples):

| Count | Median (min to max) | Rho | 90% interval |
|---|---|---|---|
| Discussions | 129 (0 to 713) | -0.01 | -0.29 to 0.28 |
| Strong buyer-intent share | 5% (0 to 50%) | 0.01 | -0.27 to 0.27 |
| Competitors observed | 9 (0 to 66) | 0.03 | -0.24 to 0.27 |

Median listings with reviews by competition check: pass 6, fail 4, not observed 4. KILL is a single
concept ("remote jobs hiring", 0 discussions, an off-topic Trends phrase).

## What the data supports

- **Nothing to fit.** 36 of 37 verdicts are WAIT. GO needs the buyer-intent check to pass, and it
  passed for none: the highest share is 50%, on 2 analyzed signals, below the 5-signal minimum.
  There is no GO or KILL group to compare against the outcome, so a threshold cannot be placed.
- **The demand threshold (10 discussions, kill below 3) separates nothing in this sample.** 36
  concepts pass it (median 129, lowest passing 19). It only separates "has stored rows" from "has
  none", and the counts do not track the outcome (rho -0.01), so no cut is better than another.
- **The intent threshold (25%) cannot be tested:** no concept reaches it with enough signals. The
  strong share has rho 0.01 against the outcome. Lowering it would only produce GOs, not better
  ones.
- **The competition cap (30) is not supported or refuted:** failing concepts show fewer reviewed
  listings (4) than passing ones (6), the opposite of "crowded means established", and 7 versus 24
  is too small to read.
- **Why the spread is so low:** the overview counts discussions over every stored signal that
  contains any word of the concept (`lib/search/overview.ts`), so the counts describe the stored
  topic, not the phrase. Concepts of one topic draw on the same stored rows ("budgeting tools",
  "budgeting apps" and "budgeting articles" read 71, 71 and 66 discussions), while their marketplace outcomes differ (budgeting phrases: 1 to 15 listings
  with reviews). A threshold cannot fix that; it is tracked as a separate defect.
- All thresholds stay as they are. The `shortcut:` comment now says what was tested.

## Limits

- n = 37 over 8 topics, and the verdict counts repeat inside a topic, so the effective sample is
  smaller than 37. A rho near 0 with an interval of plus or minus 0.28 means "not measurable at this
  size".
- The concepts were chosen by earlier calibration runs (ranked phrases), not at random; 37 of them
  sit in topics that have a stored Deep run, which is why demand passes. A concept from an unscanned
  topic gets KILL for lack of rows, which says "not scanned", not "weak market". More new concepts
  would add KILLs of that kind, not information about the thresholds, so none were bought.
- Stored data is that of the day; a new Deep run changes the counts.
