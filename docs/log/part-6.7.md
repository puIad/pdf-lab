# Part 6.7 — Scope markets, opportunities, competitors to a run

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-014. Code and unit acceptance done; the live two-run acceptance waits on DEC-015 (the chat model stopped answering). Migration `20261113000006_run_scope.sql` applied to the live project: nullable `run_id` (cascade) + index on `markets`, `opportunities`, `competitors`; `competitors.market_id` nullable; join table `run_signals` (chosen over a column on `signals` because signals are deduplicated across runs; `04-SCHEMA.md` updated). `lib/runs/run-signals.ts`: the run's ingest links every signal it returned (new and already stored) and the run reads only those (`loadRunSignals`); the table-wide text match is gone from the run path and from `fetchRunCompleteness`, which now counts by run id. Orchestrator writes `run_id` on markets, opportunities and competitors. `lib/competition/map.ts`: a listing goes to the market it was clustered into, else to the market sharing at least 2 distinctive title words (seed words and product words like "template", "pdf" excluded), else `market_id` null and its evidence hangs off the run id; price range and product gaps are now per market from its own listings. A `web` row is a competitor only on a known store host (`isStoreUrl`). Readers (`lib/runs/scope.ts`): the latest completed Deep run of each seed is current, legacy rows (`run_id` null) stay readable, an older run of the same seed is hidden unless asked for by id. Explorer: `/?run=latest` (default) / `<run id>` / `legacy` with a run select; `/api/markets?run=`; export takes a run's opportunities instead of the table's top 25; search overview and radar skip superseded runs. 286/286 tests (11 new in `lib/runs/run-scope.test.ts`: mapper, store hosts, run-scoped signal query, link writer, latest-run rule, explorer scopes, orchestrator run ids and competitor mapping), lint, typecheck, `next build` green 2026-11-13. Live so far: "budgeting" run 57f45188 linked 48 signals (gtrends 25, web 10 + 12 phrase rows, wikipedia 1) and its completeness read 35 collected / 25 analysed from its own rows; "meal prep" run linked rows from 6 sources; both then failed in extraction (DEC-015), so no run-scoped markets exist yet. Mapper hand check on stored rows (40 budgeting listings against the 20 stored budgeting markets, no model): 8 mapped, e.g. "Zero Based Budgeting, Cash Envelopes (PDF)" and "Monthly Budget Template PDF, Zero-based Budget Spreadsheet" → "Zero‑Based Budgeting Insight Pack"; "Take Control of Your Money Planner, Budget & Expense Tracker" → "Personal Budgeting Foundations"; four capital-budgeting templates → "Personal Budgeting Toolkit" (that market holds the "capital budgeting" Trends row); left on the run only: "Managing your costs with AWS Budgets", "Sponsored Products budget basics", "10 Minute Guide to Household Budgeting", "Best Sellers - Budgeting". The first version (20 % word overlap) had attached those four to markets through words like "guide"; replaced before commit. Spillover: Etsy / Gumroad / KDP adapters capped at 10 results (they sent `num: 20` at the Deep default limit of 25 and Serper answered HTTP 400, so default Deep runs observed no marketplace listing); `lib/trends/load.ts` (run filter). Observations: (1) marketplace listings go through extraction and clustering as if they were discussions (pre-existing); (2) `observeCompetition` still keeps only the first 10 listings; (3) PR #12 review: a completed run counts as current only when it saved a market, so a run that extracted nothing (or predates run scoping) cannot hide the last good run of its seed, and a run export lists the whole run's competitors, including those with no market (287 tests); (4) the home page opens on "latest", which is empty until the first run-scoped run completes; it then shows a line linking to the legacy markets (seen in headless Chrome: "/" 0 console errors, "/?run=legacy" 48 markets and the run select, `/api/markets?run=legacy` 48); (5) the explorer header buttons overflow by 223 px at 375 px (pre-existing, → 6.12).

## 2026-11-15: live two-run check with pasted runs

Deep runs complete through a pasted reply (Part 6.15), so the two-run acceptance was run that
way. The replies were written by the agent from each prompt's text. Runs: "meal prep"
`c638c48d-7d5c-424a-9012-7e788705479d` and "home workout" `7963555f-08bf-4258-87cd-a7655a711df4`
(a seed never run before). Counts are a PostgREST recount.

- Disjoint: the runs share 0 market ids, 0 market names, 0 market-linked signals, 0
  `run_signals` rows and 0 competitor ids.
- Run id: all 8 and 9 markets, all 25 and 25 opportunities and all 10 and 10 competitors carry
  their own `run_id`. Every market signal is in that run's `run_signals`. No competitor points
  at a market of another run.
- Explorer scopes: `/api/markets?run=<id>` returns 8 and 9; `?run=latest` returns 24 (8 + 9 + 7
  from the latest "budgeting" run; the older "meal prep" run is hidden); `?run=legacy` 48.
- Competitors, all 20 checked by hand:
  - Left on the run only (10): "Lazy Meal Prep for Busy Weeks", "Full Meal Plan Printable",
    "Meal Prep Pack! Printable PDF", "Weekly Meal Prep - Elliot Callaway", "Meal Prep Guide for
    Beginners, Healthy Eating & Weight ...", "Low Carb Meal Prep: Kindle Store", "PERSONAL SIZE
    Weekly Meal Planner Printable Insert", "Ultimate Home Workout: A Comprehensive Guide",
    "Homebody Hustle: The Ultimate Home Workout Guide", "At Home Workout Guide - Camufit".
  - Right market (5): both "High-Protein High-Fiber Meal Prep Guide" listings → "High protein
    meal prep"; "4 Week Home Workout Plan – No Equipment PDF" and "Energize 28: 4-Week Home
    Workout Plan" → "Home workout routines"; "At Home Workout for Moms Printable Standing Full
    Body" → "Exercises for specific body areas".
  - Neighbouring market, not the best one (5): "Weekly Meal Plan Template" → "Meal prep
    services" (shared words "weekly", "plan"; the market is about delivery); "No Equipment +
    High-Protein Meal Guide", "Beginner Home Workout Printable, No Equipment Exercise", "No Gym,
    No Excuses — 4-Week No-Equipment Home Workout Guide" and "Home Workout Printable No Equipment
    Full Body Exercise" → "Follow-along workout videos" instead of "No equipment home workouts".
- Reading: no listing sits on a market about something else, so the acceptance bullet holds.
  The five neighbours show a limit of the mapper: it counts distinctive words shared with a
  market's signal text, and a market built from short search queries ("home workout no
  equipment") offers one such word, under the two-word minimum, while a market holding one long
  snippet wins. Listed as an open defect in STATE.
- Not checked: the explorer's run select in a browser (API only).
