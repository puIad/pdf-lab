# Part 6.16 — Three matchers corrected after the 2026-11-15 live checks

Branch `phase-6-part-6.16`. Spec: `docs/phases/phase-6-hardening.md`, Part 6.16. The defects were
found in the live checks of 6.7 and 6.8 (`docs/log/part-6.7.md`, `docs/log/part-6.8.md`).

## What changed

1. Quick-idea filing (`lib/opportunities/from-ideas.ts`, `marketFor`). It used jaccard against
   all of a market's text, so the market with the fewest signals won every general idea. It now
   scores the share of the phrase's own words found in the market, with the seed's words left
   out, and counts a word in the market's name twice. A phrase that shares nothing with any
   market goes to the run's strongest market. `opportunities.market_id` is not nullable, so an
   idea always needs one.
2. Opportunity word match (`lib/opportunities/match.ts`). Used when a signal has no embedding.
   Words found in more than half of a market's signals are left out of the comparison
   (`commonWords`): the seed's words, the market's theme, and the way analyses are phrased ("they
   look for"). Markets of 3 signals or fewer keep every word, because Part 6.8 lets them share
   one evidence set. The embedding path is untouched.
3. Competitor mapper (`lib/competition/map.ts`). A title that holds every distinctive word of a
   market's name goes to that market, the longest such name first. Without a name match the old
   rule applies: at least 2 shared distinctive words with the market's name and signal text.

## Verification (2026-11-15)

- `pnpm typecheck`, `eslint`, `next build`: green. `pnpm test`: 341 of 341 (4 new: common words
  in a 5-signal market, a 3-signal market keeps its words, the name rule of the competitor
  mapper, idea filing with four markets).
- Replay of the three functions on the stored rows of runs `c638c48d` ("meal prep") and
  `7963555f` ("home workout"), read-only, stored value → new value:
  - Idea filing, "meal prep": 10 of 12 change. The 9 general ideas leave "Vegetarian meal prep"
    (1 signal): 7 go to "Meal prep recipe ideas" (the strongest market), "is meal prepping safe"
    to "Learning how to meal prep", "meal prep template free" to "Budget meal prep". "is meal
    prep healthy" and "meal prep plans" stay in "Healthy meal prep plans".
  - Idea filing, "home workout": 4 of 9 change. "at home workout" and "8 week workout plan at
    home" leave "Home workout bench" for "Home workout routines"; "do 20 minute workouts really
    work?" leaves "Home workout equipment" for "Home workout routines".
  - Match counts: "Meal prep recipe ideas" (6 signals) 6, 6, 6, 6 → 1, 1, 3, 2. "Learning how to
    meal prep" 4, 2, 4 → 1, 1, 2. "Home workout equipment" six times 6 → 2, 1, 1, 1, 2, 1. "Home
    workout routines" 4, 4, 4, 4 → 2, 2, 1, 3. "Home workout bench" (3 signals) stays 3, 3, 3.
  - Competitors, "home workout": the four no-equipment listings move from "Follow-along workout
    videos" to "No equipment home workouts". Two 4-week no-equipment plans also move there from
    "Home workout routines"; both markets fit them. The 4 unattached ones stay unattached.
  - Competitors, "meal prep": nothing changes.

## Not fixed, not verified

- "Weekly Meal Plan Template" still maps to "Meal prep services" through the words "weekly" and
  "plan". No market name is contained in its title, so the name rule does not apply.
- No new live run was made. The functions were replayed on stored rows; the stored rows of the
  two runs keep the old assignments and counts until a new run of those seeds.
- An idea whose words are in no market lands in the strongest market. That is a neutral place,
  not a fitting one ("can meal prep last 5 days" → "Meal prep recipe ideas").
- "More than half of the signals" and the 3-signal limit are first guesses, marked in the code
  comments. They were checked on these two runs only.

## 2026-11-16: review fix (PR #20)

The model path (`generateWithAIRouter`) picked a candidate's own signals with `problemOverlap`
and no common-word set, so a model-worded problem could still take a whole market as its own
("6 of 6"). It now passes `commonWords(market.signals)`, the same set `matchSignals` uses. One
test added: a six-signal meal prep market, model problem "Meal prep chicken ideas", evidence is
the chicken signal only. 342/342 tests, lint, typecheck green.
