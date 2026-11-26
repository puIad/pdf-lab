# How a concept should match stored rows (2026-11-26, defect #109)

Follows `2026-11-26-verdict-calibration.md`: the Validate counts describe the stored topic, not the
phrase. **Result: no option is clearly right, so no code changed. It is a trade-off, logged as
DEC-021.** A second fault turned up while measuring and is tracked as #111.

## Method

- **Concepts:** the same 37 phrases as the calibration note (stored competition checks with
  listings, found through the `listing observed for "<phrase>"` evidence claims and
  `loadStoredChecks`). 0 Serper calls, $0.
- **Run:** a throwaway script called the real `generateMarketOverview(phrase, supabase, { mode:
  "validate" })` and `buildVerdict` with `.env.local`, once per matching option, with the table reads
  memoized. Matching was switched through a temporary env flag in `overview.ts` (reverted, not
  committed). The same flag applies to markets, signals, evidence, opportunities and competitors, and
  keeps the existing "whole phrase appears in the text" test in every option. The script and its JSON
  stay untracked.
- **Outcome:** listings with reviews among the stored Etsy, Gumroad and KDP results (as before).
  Spearman rho, 90% bootstrap interval (2000 resamples) against it.
- **Options:** `any` (today: any one word of the phrase, after dropping 12 stopwords and words under
  2 letters), `all` (every remaining word appears somewhere in the row's text), `phrase` (the whole
  phrase as a substring only), `two` (at least two words, or all if the phrase has fewer).
- No stopword list beyond those 12 exists, so question words ("what", "is", "how", "why", "best")
  count as content words. This hurts `all` and `phrase` for the "what is budgeting" kind of phrase.
  Not changed or measured separately.

## The row cap changes the numbers (#111)

`signals` has 3209 rows and `evidence` 3101, and the overview reads each with one unpaged query, so
Supabase returns the newest 1000 of each. Both tables are measured: **capped** (what the app does
today) and **uncapped** (paged reads, same code).

## Result, capped (as the app runs today), n = 37

| Option | Disc. median (min to max) | Intent signals median (min to max) | Competitors median (min to max) | GO / WAIT / KILL | Zero-discussion concepts | Rho disc. [90%] | Rho intent signals [90%] | Rho competitors [90%] |
|---|---|---|---|---|---|---|---|---|
| any | 129 (0 to 713) | 59 (0 to 327) | 9 (0 to 66) | 0 / 36 / 1 | 1 | -0.01 [-0.30, 0.29] | -0.04 [-0.32, 0.24] | 0.03 [-0.23, 0.29] |
| all | 0 (0 to 116) | 0 (0 to 45) | 0 (0 to 8) | 0 / 11 / 26 | 20 | 0.32 [0.08, 0.54] | 0.37 [0.13, 0.57] | 0.06 [-0.16, 0.31] |
| phrase | 0 (0 to 12) | 0 (0 to 5) | 0 (0 to 1) | 0 / 7 / 30 | 25 | 0.26 [0.01, 0.48] | 0.21 [0.02, 0.39] | 0.01 [-0.09, 0.11] |
| two | 40 (0 to 626) | 29 (0 to 280) | 0 (0 to 44) | 0 / 27 / 10 | 7 | 0.06 [-0.20, 0.33] | 0.01 [-0.28, 0.30] | 0.03 [-0.24, 0.28] |

## Result, uncapped (rows paged), n = 37

| Option | Disc. median (min to max) | Intent signals median (min to max) | Competitors median (min to max) | GO / WAIT / KILL | Zero-discussion concepts | Rho disc. [90%] | Rho intent signals [90%] | Rho competitors [90%] |
|---|---|---|---|---|---|---|---|---|
| any | 404 (41 to 2236) | 208 (22 to 1049) | 9 (0 to 66) | 0 / 37 / 0 | 0 | -0.07 [-0.33, 0.20] | -0.13 [-0.38, 0.15] | 0.03 [-0.23, 0.29] |
| all | 11 (0 to 116) | 5 (0 to 45) | 0 (0 to 8) | 1 / 23 / 13 | 7 | 0.21 [-0.06, 0.46] | 0.14 [-0.11, 0.38] | 0.06 [-0.16, 0.31] |
| phrase | 3 (0 to 39) | 1 (0 to 19) | 0 (0 to 1) | 0 / 20 / 17 | 12 | 0.01 [-0.26, 0.30] | -0.09 [-0.36, 0.20] | 0.01 [-0.09, 0.11] |
| two | 116 (0 to 2106) | 64 (0 to 1003) | 0 (0 to 44) | 0 / 36 / 1 | 1 | 0.03 [-0.27, 0.31] | 0.04 [-0.27, 0.31] | 0.03 [-0.24, 0.28] |

Zero-competitor concepts (verdict competition check "not observed"): any 6, all 33, phrase 36, two 21
(same in both tables; competitors are not row-capped).

## What it shows

- **`any` cannot separate concepts** (capped: 33 distinct discussion counts, 36 of 37 at 19 or
  more; uncapped: every concept has at least 41). The note's finding stands, and uncapped it is
  starker: 37 of 37 WAIT.
- **`all` and `phrase` make counts describe the phrase, and most phrases then have no stored rows.**
  Capped, 26 and 30 of 37 become KILL; uncapped, 13 and 17. A KILL here means "not scanned", the
  same reading the calibration note warned about for an unscanned topic. The one GO (uncapped `all`)
  is "home workout routines": 19 discussions, 2 of 6 analyzed intents strong, 0 competitors observed,
  7 listings with reviews. One concept, not a pattern.
- **The correlation with marketplace outcomes appears only in the capped `all`/`phrase` runs** (rho
  0.32 [0.08, 0.54]) and mostly disappears uncapped (0.21 [-0.06, 0.46]). It rests on the 10 to 17
  concepts with a non-zero count, from 8 topics. Weak evidence; not a fit.
- **`two` keeps most concepts alive** (1 KILL uncapped, 10 capped) but its counts are close to
  `any`'s and rho stays 0.
- **Competitors** barely move the outcome in any option (rho 0.01 to 0.06).

## Other callers of `generateMarketOverview`

The matching is inside the function, so every caller changes with it:

- `POST /api/research`, Validate (`mode: "validate"`) and `lib/brief/load.ts`: the verdict and the
  brief's market numbers.
- `POST /api/research`, Explore (`mode: "explore"`, `persistRun: false`): the same function on a
  topic seed. A topic search wants the topic-wide net; `all` or `phrase` would shrink it to rows that
  contain every word.
- `GET/POST /api/search` and `app/search/page.tsx`: the free-text Market Overview page the owner
  sees. Same effect as Explore.

A rule for Validate only needs a parameter on the function (for example an option the Validate callers
pass), not a change at the shared match.

## Limits

n = 37 over 8 topics, chosen by earlier calibration runs; counts repeat inside a topic. Intervals of
plus or minus 0.25 mean "not measurable at this size". Stored data is that of 2026-11-26.
