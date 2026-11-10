# PHASE 6 — Hardening & launch (QC, metrics, go-live)

Goal: prove trust + usefulness, then launch scoped. PRD refs: §50, §53–§55, §57–§59.
Phase gate (launch gate): QC rules enforced in code, confidence displayed everywhere,
metrics events firing, cost-per-run known, legal/ToS reviewed, roadmap handed off.

## Part 6.1 — QC enforcement + confidence display + anti-gaming review

- Deps: 2.4, 3.4. Touches: validators, UI copy pass, tests.
- Tasks:
  1. Codify PRD §53 1–5 as blocking validators with tests (each rule has a failing-case
     test proving the block).
  2. PRD §54 pass: every score/label shows confidence + basis or explicit uncertainty;
     audit-grep for banned phrases ("huge market", "high demand" without counts).
  3. Fixture purge: no `fixture` data reachable in production paths.
- Acceptance: all five negative tests pass; copy audit clean; fixtures isolated to tests.

## Part 6.2 — Success-metrics instrumentation

- Deps: 6.1. Touches: `lib/analytics/*`, key click/save handlers.
- Tasks:
  1. Events per PRD §58: opportunity saved (usefulness), useful-vote (quality),
     claim-evidence coverage (auto-computed), new-market detections, research→creation
     conversion, monitor returns (retention).
  2. North-star dashboard (internal): Validated Opportunities Discovered per Active User
     (PRD §59) — NOT searches performed.
- Acceptance: click save → event row; dashboard renders north-star from real events.

## Part 6.3 — Launch checklist + handoff

- Deps: 6.2. Touches: docs only (+ fixes found).
- Tasks:
  1. Costs: per-run $ at free/BYOK/premium; monthly projection at 100/1k/10k users.
  2. Abuse/legal: rate limits, ToS review per source (esp. marketplace/Tier-3 — TikTok
     stays OUT per §50), privacy (hashed authors), takedown/export-deletion path.
  3. Roadmap handoff per PRD §57 (V1 discovery → V1.5 marketplace → V2 monitoring →
     V2.5 alerts → V3 creation assistant → DISCOVER→…→SELL pipeline).
  4. Update STATE (all done), close or carry DEC entries, tag release.
- Acceptance: checklist signed in file; `git tag mvp-v1`; next-roadmap issues filed.
- Review: full checklist + LAUNCH gate. Ship it.

---

# Parts 6.4 to 6.13: findings from the 2026-11-10 app evaluation (DEC-014)

Source: a read of the code and docs on 2026-11-10 (branch `phase-3-part-3.10`, commit 693ad87).
The app was not run during the evaluation, so every part starts by confirming the finding in the
current code. Line numbers are from that commit and may have moved.

Common cause of 6.4 to 6.6: the pipeline was built against one test niche (`pc troubleshooting`)
with acceptance criteria phrased as counts ("25 opportunities", ">=1 gap"). Code then filled the
count with fixed text when the data did not. Part 6.1 task 3 ("fixture purge") was marked done
but these paths remain reachable in production.

Rule for all of these parts: when the data does not support an output, return less and say
"Not observed". Never pad to a target count. Any acceptance criterion elsewhere in `docs/` that
demands a fixed count regardless of data loses to `06-EVIDENCE-CONTRACT.md`; patch that criterion
in the same part.

Recommended order: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.11, 5.1 (auth, pulled ahead of Phase 4),
6.12, 6.10 (after DEC-001 is answered), 6.13 any time. Phase 4 starts after 6.7 and 5.1.

## Part 6.4 — Remove invented content from the Deep pipeline

- Deps: 2.1, 2.3, 1.4 (all done). Touches: `lib/opportunities/generator.ts`,
  `lib/opportunities/types.ts`, `lib/competition/review-miner.ts`, `lib/cluster/summarizer.ts`,
  their tests, `docs/phases/phase-2-report.md` (acceptance wording).
- Findings:
  1. `generator.ts` `generateCandidatePool` (L92) builds candidates from fixed PC text:
     `DIVERSE_AUDIENCE_TEMPLATES` (L56, "Competitive Gamers & Streamers" and 7 more),
     `MECHANISM_TEMPLATES` (L78, BIOS and hardware wording), a fixed `outcome` ("Eliminate ...
     downtime in under 15 minutes without expensive repair shop visits"), and a fixed `solution`
     suffix ("offline printable PDF with step-by-step diagnostic workflows"). Titles are
     `${market.name}: ${audience} ${format}`. A budgeting run produced "Personal Budgeting
     Foundations: Competitive Gamers & Streamers Planner" (STATE 3.10 observation 2).
  2. Same function: `urgency` is `fIdx % 3`, `priceRange` and `sophistication` come from the
     static `FORMAT_PRICE_TIERS` table (L67), and `opportunityScore` is
     `demandScore + formatBonus - fIdx * 1.5`. None of these is observed.
  3. The AI path pads with that pool whenever the model returns fewer than 25
     (`if (out.length < 25)` near L514), and it is the only path when no router is configured.
  4. The AI system prompt lists PC-flavoured example audiences ("gamers, IT technicians").
     AI defaults are also invented: `priceRange || "$15–$25"`, `outcome || "Resolve problem quickly"`.
  5. `review-miner.ts`: all five `MINING_PATTERNS` (L28) carry PC-repair `gapTitle`,
     `gapSummary` and `opportunityTranslation` texts, and one regex matches PC phrases
     ("when pc won't boot", "doesn't apply to windows 11"). The "guaranteed fallback" (L200)
     creates a gap when nothing matched, quoting the first 150 characters of an unrelated text,
     or the invented sentence "Users struggle to diagnose root-cause hardware failures..." when
     there is no text at all. The likes regex (L172) is PC-specific too ("saved my pc").
  6. `summarizer.ts`: default audience "PC users & builders" (L39) and fixed PC cluster names
     (around L100 to L120).
- Tasks:
  1. Candidate pool: build only from observed fields. Audience from the market's
     `signal_analysis.audience` values (skip a candidate when none), problem from
     `analysis.problem`, format from the formats the signals or quick ideas point at
     (`lib/ideas` already infers format from a phrase). Delete the audience and mechanism
     template tables, the fixed outcome and the fixed solution suffix.
  2. Price: use the observed paid range of the market's stored competitors, the way
     `lib/brief/build.ts` does for the price anchor. No stored prices means `priceRange` is null and
     the UI shows "Not observed". If `FORMAT_PRICE_TIERS` is kept anywhere, it is labeled a
     Suggestion (QC Rule 5), never a fact. Check `lib/brief` and exports for other readers.
  3. Urgency and sophistication: derive from `signal_analysis.urgency` of the attached signals,
     or leave null.
  4. Remove the pad-to-25. `selectDiversifiedOpportunities` already returns fewer when the pool
     is smaller. Report "N of 25 target, limited by evidence" in the run trace and on the
     report page. Patch the MVP gate wording in `02-MASTER-PLAN.md` and the 2.1 acceptance in
     `phase-2-report.md` to "up to 25".
  5. AI path: remove the PC example audiences from the prompt, drop the invented defaults
     (skip a candidate missing a required field), and reject a candidate whose `marketId` is
     not in the input (today it falls back to `markets[0]`).
  6. Review miner: make the pattern texts niche-neutral, or drop the fixed titles and use the
     quoted excerpt plus its category as the gap (briefs already do this, 3.10 observation 3).
     Remove the PC phrases from the regexes. Delete the guaranteed fallback: zero matches
     means zero gaps. Patch the 2.3 acceptance (">=1 gap") to ">=1 gap when a review or
     discussion matches".
  7. Summarizer: no PC defaults. Unknown audience is null. A cluster name without a model comes
     from its most frequent problem terms.
  8. Tests: run each generator, miner and summarizer against a non-PC fixture (for example
     budgeting) and assert the output contains none of: "PC", "BIOS", "gamer", "repair shop",
     "hardware", "boot". Add a test that an empty or thin market yields fewer than 25 and that
     no gap is produced from text with no pattern match.
- Acceptance: a Deep run (or the unit-level equivalent if the model quota is out) on a non-PC
  seed contains no PC text; opportunity count equals what the pool supports; every price,
  urgency and audience traces to a stored row or shows "Not observed"; lint, typecheck, tests,
  build green.

## Part 6.5 — YouTube adapter: no template comments; clean stored fakes

- Deps: 3.3 (done). Touches: `lib/sources/youtube/youtube-adapter.ts` + test,
  `lib/brief/load.ts` (`isTemplateRow`), live DB rows.
- Findings:
  1. Without `YOUTUBE_API_KEY`, `collect()` returns `generateFallbackSignals()` (L119, L291):
     invented comments with `externalId` `yt_fallback_*` on video `dQw4w9WgXcQ`. Five such rows
     are stored as signals (STATE 3.10 observation 1). `healthCheck` reports `ok: true` in this
     mode (L104).
  2. The PC market's competitors include a fake-looking ASIN `B0CT1Trouble` (3.10 observation 2).
- Tasks:
  1. No key means the adapter is not configured: `collect()` returns nothing and the source is
     reported `skipped`, the same way the web adapter behaves without `SERPER_API_KEY`.
     `healthCheck` says not configured. Delete `generateFallbackSignals`.
  2. Find the stored fakes: signals with `external_id like 'yt_fallback_%'`, and every
     `signal_analysis`, `market_signals` and `evidence` row that hangs off them; competitors
     whose url or title contains `B0CT1Trouble`. List counts to the user and get a yes before
     deleting (permanent deletion). Then remove `isTemplateRow` from `lib/brief/load.ts`.
  3. Grep the other adapters and `lib/` for the same pattern (`fallback`, `mock`, `seed`,
     `fixture`, `sample`) outside tests and report what is left.
- Acceptance: adapter test proves no key gives zero signals; `select count(*)` of
  `yt_fallback_%` signals is 0 after cleanup; the grep report is in STATE notes.

## Part 6.6 — Radar reads the database

- Deps: 6.5. Touches: `lib/trends/service.ts`, `app/api/radar/route.ts`,
  `app/api/trends/*`, `app/api/topics/solvable/route.ts`, `app/radar/page.tsx`, tests.
- Finding: `trendingRadarService` is constructed from `getSeededMarketTopics()`
  (`service.ts` L25, L268, L412), a hand-written list of topics with invented signals dated
  relative to `Date.now()`. `/radar`, `/api/radar`, `/api/trends/delta`,
  `/api/trends/seasonal` and `/api/topics/solvable` serve it as if observed.
- Tasks:
  1. Load topics from `markets` + `market_signals` + `signals` (dated rows only, QC Rule 2)
     and stored competitors for `competitorCount`. Reuse the detector and calculator unchanged.
  2. Move `getSeededMarketTopics` into a test helper file; no production import.
  3. Empty or thin data renders an empty state that says how many dated signals exist, not a
     populated radar.
- Acceptance: with the seeded list removed from production code, `/api/radar` returns only
  topics whose ids exist in `markets`; a market with fewer than 2 dated signals shows trend
  `unknown`; page renders with 0 console errors.

## Part 6.7 — Scope markets, opportunities and competitors to a run

- Deps: 6.4. Touches: new migration in `supabase/migrations/`, `docs/04-SCHEMA.md`,
  `lib/runs/orchestrator.ts`, `lib/runs/service-deps.ts`, `lib/markets/fetcher.ts`,
  `lib/export/fetcher.ts`, `lib/brief/load.ts`, `lib/search/overview.ts`, explorer UI.
- Findings:
  1. `markets`, `opportunities` and `competitors` have no `run_id` (schema v1 L64 to L107).
     Each Deep run inserts new global rows; the home page lists every run's markets mixed.
  2. `getSignals(query)` (`service-deps.ts` L88) selects signals by a text filter over the whole
     table with no limit, so a run re-reads rows collected by other seeds that share a word.
  3. All competitors found in a run are saved against `marketCandidates[0]`
     (`orchestrator.ts` L314), whatever market they relate to. Competition evidence gets the
     same `entityId`, and it falls back to `runId` when there are no markets.
  4. `observeCompetition` (`service-deps.ts` L386) treats any `web` result whose title contains
     "guide", "book", "troubleshooting" and similar as a competitor product.
- Tasks:
  1. Migration: nullable `run_id uuid references research_runs(id) on delete cascade` on
     `markets`, `opportunities`, `competitors`, with indexes. Legacy rows keep null. Apply to
     the live project and update `04-SCHEMA.md`.
  2. Record which signals a run collected (a `run_signals` join table, or `run_id` set at
     ingest in `engagement`-free form; pick one and note it in the schema doc). The run then
     works on its own signals plus stored quick-idea rows for the seed, not a table-wide match.
  3. Orchestrator writes `run_id` on everything it saves.
  4. Competitors: assign each to the market whose signals or name it overlaps best (token
     overlap is enough; `from-ideas.ts` has a mapper to copy). Below a minimum overlap it stays
     attached to the run only, with `market_id` null (make the column nullable in the same
     migration), not to the first market.
  5. Tighten the web-product rule: marketplace adapters are the competitor source; a `web`
     row counts only when its host is a known store. Otherwise it is a discussion.
  6. Readers: explorer, market page, export and briefs filter by run. The home page shows the
     latest completed run per seed, with older runs reachable.
- Acceptance: two Deep runs on different seeds produce disjoint market sets, each row carrying
  its `run_id`; no competitor row is attached to an unrelated market (spot check 10 by hand and
  record them); tests cover the competitor mapper and the run-scoped signal query.

## Part 6.8 — Evidence that belongs to the opportunity

- Deps: 6.4, 6.7. Touches: `lib/opportunities/generator.ts`, `lib/evidence/qc.ts`,
  `lib/runs/orchestrator.ts`, opportunity page.
- Findings:
  1. Every opportunity in a market gets `market.signals.slice(0, 3)` as its evidence, in both
     the deterministic and the AI path. Twenty opportunities can cite the same three rows.
     QC Rule 1 passes on row count alone.
  2. With no signals, a single evidence row with no source, url or excerpt is written
     ("directly addresses market cluster") and still satisfies Rule 1.
  3. `enforceRule4_DemandCounts` receives `pair.evidence.length`, so "demand" is the number of
     attached rows (at most 3), not an observed count.
  4. Market evidence rows all use `signalType: "pain_point"` regardless of the signal.
- Tasks:
  1. Attach to each opportunity the signals that match its problem and audience: rank the
     market's signals by embedding similarity to the opportunity's problem text (embeddings are
     already stored), or token overlap when embeddings are missing. Keep those above a
     threshold, up to 5.
  2. Rule 1 requires at least one evidence row with a `source_id` and a url or excerpt.
     Source-less rows do not count. An opportunity with none is dropped, not saved.
  3. Rule 4 gets the count of matching signals for that opportunity, and the page shows it
     ("7 of 31 discussions in this market mention this problem").
  4. `signalType` follows the signal: `pain_point` only when extraction found a problem;
     otherwise the source's own type.
- Acceptance: in a completed run, no two opportunities with different problems share an
  identical evidence set unless the market has 3 or fewer signals; zero saved opportunities
  lack a sourced evidence row; negative tests for the stricter Rule 1 and Rule 4.

## Part 6.9 — Batched extraction; a run that analysed nothing fails

- Deps: 1.3 (done). Touches: `lib/ai/extraction.ts`, `lib/runs/orchestrator.ts`,
  `lib/runs/completeness.ts`, tests. Re-verify provider limits per `07-AI-ROUTER.md`.
- Findings:
  1. Extraction is one model call per signal. A 102-signal run took 17.7 minutes at about 7
     signals a minute (DEC-013), and one run can use the whole OpenRouter free quota of 50
     calls a day (DEC-012: 17 of 91 analysed).
  2. Extraction failures do not fail a run: run `171abdef` completed with 0 analysed and 0
     markets (STATE 3.8). The orchestrator ignores the `failed` count from `deps.extract`.
  3. Signals with no embedding are silently skipped by the clusterer (`clusterer.ts` L31).
- Tasks:
  1. Send signals in batches (start at 10 per call, configurable) with one JSON array out,
     each item keyed by signal id. Validate per item; retry only the ids that failed or were
     missing, singly. Record prompt version on the rows.
  2. Orchestrator: fail the run when fewer than a set share of signals were analysed (start at
     50 percent, `shortcut:` until calibrated) and put analysed/failed/unembedded counts in the
     trace and the completeness panel. A partial result below 100 percent is shown as partial.
  3. Measure before and after on the same stored signals: calls, wall time, and agreement of
     `intent` / `pdf_relevance` between single and batched extraction on at least 25 signals.
     If agreement is poor, lower the batch size and record the numbers.
- Acceptance: a run of about 100 signals uses at most 15 extraction calls; the measured
  numbers are in STATE; a test proves a run with all extractions failing ends `failed`.

## Part 6.10 — Deep runs as a background job (blocked on DEC-001)

- Deps: 6.9, DEC-001 answered. Touches: `app/api/runs/route.ts`, `app/api/research/route.ts`,
  `lib/runs/*`, Deep research dialog, `/ideas` and `/research` Deep buttons.
- Findings:
  1. `executeResearchRun` runs inside the HTTP request that started it. Even after 6.9 a run
     exceeds a Vercel function limit, so production cannot run Deep at all (DEC-001 interim).
  2. A step timeout rejects the wrapper promise but does not cancel the work
     (`withTimeout`, `orchestrator.ts` L29), so a "failed" run can keep writing rows.
  3. The dashboard Deep Research dialog posts to `/api/runs` without a key and always gets
     401 (STATE 3.4 observation 1).
- Tasks:
  1. Ask DEC-001 with the measured post-6.9 duration. Do not pick a provider without the answer.
  2. Start returns a run id at once; each lifecycle state is a resumable step that reads its
     inputs from the DB; the UI polls `GET /api/runs/[id]` (it already exposes the trace).
  3. Pass an `AbortSignal` into ingest and extraction so a timed-out step stops.
  4. The dialog works for a signed-in user once 5.1 lands; until then it explains the 401 the
     way `/ideas` does.
- Acceptance: a Deep run started from the deployed site completes and survives a closed tab;
  a forced step timeout leaves no rows written after the failure time.

## Part 6.11 — Score honesty and a calibration source the project controls

- Deps: 3.9 (done). Touches: `lib/scoring/scoring.ts`, `lib/ideas/ideas.ts`,
  `lib/ideas/ticks.ts`, `lib/planner/verdict.ts`, score UI, `docs/05-PIPELINE-SCORING.md`.
  Relates to 3.11, which stays blocked on the PDFMinter file; this part does not wait for it.
- Findings:
  1. `scoreMarket`: `volumeDemand = min(70, evidenceCount * 7)` saturates at 10 signals and
     `problemFrequency` reaches 1.0 at 10, so the demand score mostly reflects the ingest
     limit (default 25), not the market.
  2. `extractEngagementTotal` (L47) sums every numeric field in `engagement`, mixing upvotes,
     comment counts, ranks, positions and Trends values.
  3. The product of factors is uncalibrated: unanalysed signals count as `weak` intent (0.35),
     so a market with failed extraction scores low for a reason unrelated to demand.
     `competitiveDensity` is never passed, so it is always 1.0.
  4. Card ticks and verdict thresholds are `shortcut:` guesses (3.8, 3.9).
- Tasks:
  1. Demand uses observed quantities that do not depend on the fetch limit: counts per source
     with their own caps, Trends interest, question-phrase share. Sum only named engagement
     keys per source type (define the list next to each adapter).
  2. Intent averages over analysed signals only and shows "n analysed of m". Feed stored
     competition counts into `competitiveDensity`, or remove the factor from the formula and
     the docs.
  3. UI: raw counts first, the composite score second and labeled as a rule-based index
     (DEC-010 already chose raw counts for competition).
  4. Calibration without PDFMinter: use stored 3.9 competition checks as the outcome proxy
     (listings showing reviews, review totals). Collect checks for at least 30 phrases across
     5 seeds, then report rank correlation of each score and tick against the proxy in
     `docs/research/`. Adjust thresholds only where the data supports it; leave the rest
     marked `shortcut:`. Say plainly that reviews are a proxy for sales, not sales.
- Acceptance: doubling the ingest limit on the same seed changes the demand score by less
  than 10 percent; the calibration note exists with its numbers; scoring tests updated.

## Part 6.12 — Ideas-first home and shared navigation

- Deps: 3.10 (done), 6.7 for the runs list. Touches: `app/layout.tsx`, `app/page.tsx`,
  `app/ideas/*`, `components/markets-table/*`. Frontend rule in `AGENTS.md` applies; see 6.13
  for the missing megalibrary path.
- Findings:
  1. The path that works end to end and costs almost nothing is quick ideas → Validate →
     competition check → brief. The home page instead shows the explorer over the global
     `markets` table, which holds mostly old PC test data.
  2. `app/layout.tsx` has no shared navigation; pages are reached by typing URLs or through
     page-local links.
- Tasks:
  1. `/` becomes the seed entry (the `/ideas` scan) with recent seeds and, below it, recent
     Deep runs. The explorer table moves to `/markets`. Keep `/ideas` working (redirect or
     shared component).
  2. One header in the root layout: Ideas, Markets, Research, Radar. Hide Radar until 6.6 is done.
  3. Deep research is offered from a scanned seed ("Go deeper on this seed"), which is where
     it has stored ideas to work with.
- Acceptance: from `/`, a new visitor reaches a brief without typing a URL; 0 px overflow at
  375 px; 0 console errors; existing deep links still resolve.

## Part 6.13 — Lighter process docs

- Deps: none. Touches: `docs/STATE.md`, new `docs/log/`, `docs/00-START-HERE.md`,
  `docs/01-PHILOSOPHY.md`, `AGENTS.md`.
- Findings:
  1. `STATE.md` rows for 3.4 to 3.10 are several hundred words each, and every session must
     read the whole file before any work.
  2. Known defects are recorded as "Observations" inside done rows with no part that owns
     them, so they are not picked up by "continue, next unfinished part".
  3. `AGENTS.md` requires all frontend to come from
     `C:\Users\pulad\Desktop\frontend-ai-megalibrary`, which is missing on this machine (3.10
     observation 4). The load-order rule says a missing listed file is a decision request.
  4. `00-START-HERE.md` "Status in one glance" still says the workspace is empty.
- Tasks:
  1. Move each row's notes to `docs/log/part-<N>.<M>.md` verbatim. The STATE row keeps:
     status, commit, one line (at most 25 words), link to the log.
  2. Add an "Open defects" table to STATE: defect, found in, owning part. Seed it from the
     observations in rows 3.4 to 3.10 and map each to a part in 6.4 to 6.12 or mark it unowned.
  3. Update the session protocol: read STATE, open a part log only when working on or
     depending on that part.
  4. Ask the user where the megalibrary lives now (decision request) and fix the path in
     `AGENTS.md` and `00-START-HERE.md`. Refresh the stale status block.
- Acceptance: `STATE.md` is under 150 lines; no text was lost (line counts of moved notes
  recorded); every observation has an owner or is listed as unowned.
