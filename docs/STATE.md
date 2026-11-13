# STATE — live build tracker (update EVERY part, same turn)

Convention: `pending | in_progress | blocked | done`. Exactly ONE `in_progress`.
Done = code runs + acceptance met + review passed + commit hash recorded.
A row holds status, commit and one line (at most 25 words). Everything else about a part goes in
`docs/log/part-<N>.<M>.md`: open it only when working on that part or depending on it. A known
defect goes in "Open defects" below with an owner, not inside a done row.

## Phase 0 — Foundation

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 0.1 | Scaffold Next.js + Tailwind + shadcn/ui + hygiene | done | bcc11dff | Next.js 16 scaffold with Tailwind, shadcn/ui and a health route. [log](log/part-0.1.md) |
| 0.2 | Supabase + schema v1 + pgvector + RLS + env | done | 1390511f | Supabase project, schema v1, pgvector, RLS and seed sources. [log](log/part-0.2.md) |
| 0.3 | Vercel deploy + CI gate + env docs | done | ba559a1d + 11cea9c7 (+ docs-finalize, see log) | Vercel production deploy and the lint, typecheck, build CI gate. [log](log/part-0.3.md) |

## Phase 1 — Research engine

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 1.1 | Adapter interface + registry + Reddit adapter | done | ca52d088 | SourceAdapter interface, registry and the Reddit adapter. Production Reddit still needs its own app id (DEC-005). [log](log/part-1.1.md) |
| 1.2 | Trends + web-search adapters + ingest | done | 9ca1f9e0 | Google Trends and Serper web adapters plus the deduplicating ingest pipeline. [log](log/part-1.2.md) |
| 1.3 | AI extraction via AIRouter | done | a9b084a | AIRouter and extraction of audience, problem, intent, urgency and PDF relevance. Batched in 6.9. [log](log/part-1.3.md) |
| 1.4 | Clustering (pgvector) + market scoring | done | 5127c69 | Embeddings, cosine clustering into markets and the market score with confidence. [log](log/part-1.4.md) |
| 1.5 | Evidence store + confidence + run lifecycle | done | 3a28f84 | Evidence store, QC Rules 1 to 5 and the 10-state run lifecycle. [log](log/part-1.5.md) |

## Phase 2 — Report (★ MVP gate after 2.2 + export-min)

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 2.1 | 25-opportunity generator | done | 17eee89 | Opportunity generator with diversification rules. Rewritten in 6.4 to use observed fields only. [log](log/part-2.1.md) |
| 2.2 | Opportunity + market report pages + citations | done | 3d89043 | Market and opportunity report pages with evidence citations. Fixed copy removed in 6.14. [log](log/part-2.2.md) |
| 2.3 | Competition + review mining (Tier-2 adapters) | done | 0b412c6 | Etsy, Gumroad and KDP adapters through Serper, landscape shares and review mining. [log](log/part-2.3.md) |
| 2.4 | Export (MD/CSV/JSON) + quality panel | done | 375b14f | Markdown, CSV and JSON export plus the research quality panel. [log](log/part-2.4.md) |

## Phase 3 — Explorer

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 3.1 | Explorer homepage (DB-backed) | done | aa3ef59 | Explorer table over stored markets with filters and the Deep research dialog. [log](log/part-3.1.md) |
| 3.2 | Market search + overview page | done | 5ad56cc | Market search and the nine-line overview, each line cited or "Not observed". [log](log/part-3.2.md) |
| 3.3 | Trending engine + Radar | done | 475741c | Trend detector, radar calculator and the four-window radar page. Reads the database since 6.6. [log](log/part-3.3.md) |
| 3.4 | NL research + modes | done | 2536ff4 | Rule-based planner and the five research modes behind /research. [log](log/part-3.4.md) |

| 3.5 | Keyless discovery adapters (local-only autocomplete + Wikipedia) | done | 00f47e6 | Local-only autocomplete adapter and the Wikipedia pageviews adapter. [log](log/part-3.5.md) |
| 3.6 | Quick ideas + auto-outline | done | 01ed4bd | Quick ideas per phrase with scores and an outline on /ideas. [log](log/part-3.6.md) |
| 3.7 | Production phrase source + scan conveniences | done | b21d377 | Serper People-also-ask and related searches as the production phrase source, regions, scan CSV. [log](log/part-3.7.md) |
| 3.8 | Ideas ↔ pipeline + Validate verdict + card ticks | done | 645c33c | Quick ideas feed Deep runs, GO / WAIT / KILL verdict, card ticks. [log](log/part-3.8.md) |
| 3.9 | On-demand competition check per idea | done | 6c52058 | On-demand competition check per idea, stored as evidence, raw counts only. [log](log/part-3.9.md) |
| 3.10 | Build-ready brief (MD + DOCX) | done | 75c87f3 | Build-ready brief from an opportunity or a validated idea, as Markdown and DOCX. [log](log/part-3.10.md) |
| 3.11 | Score calibration | blocked | — | Waits for the user's PDFMinter scan file. 6.11 calibrates from stored checks instead. [log](log/part-3.11.md) |

The 3.3 radar fix of 2026-11-06 is in [log/part-3.3.md](log/part-3.3.md).

## Phase 4 — Monitoring

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 4.1 | Watchlist | pending | — | Watchlist of markets, idea seeds and saved ideas. [log](log/part-4.1.md) |
| 4.2 | Scheduled re-research + change detection | pending | — | Scheduled re-research with change detection and daily seed re-scans. DEC-001 is decided here. [log](log/part-4.2.md) |
| 4.3 | Alerts (in-app first) | pending | — | In-app alerts and a weekly digest. [log](log/part-4.3.md) |

## Phase 5 — Monetization

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 5.1 | Auth + tiers + quotas | pending | — | Auth, tiers and quotas. |
| 5.2 | BYOK vault + routing + metering | pending | — | BYOK key vault, per-request routing and usage metering. |
| 5.3 | Hosted-premium + limits UX | pending | — | Hosted premium path and the limits UX. |
| 5.4 | Send brief to Google Docs | pending | — | Send a brief to Google Docs with the project's own OAuth client. [log](log/part-5.4.md) |

## Phase 6 — Hardening

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 6.1 | QC enforcement + code review fixes | done | 208926d | The 22 fixes from the code review report. [log](log/part-6.1.md) |
| 6.2 | Metrics instrumentation (§58–§59) | pending | — | Success-metrics events (PRD §58 to §59). |
| 6.3 | Launch checklist + handoff | pending | — | Launch checklist and handoff. |
| 6.4 | Remove invented content from the Deep pipeline | done | 521c5f8 | Deep pipeline builds opportunities from observed fields only, nothing padded to 25. [log](log/part-6.4.md) |
| 6.5 | YouTube adapter: no template comments; clean stored fakes | done | 1341ac0 + cdbe75f | YouTube adapter skips without a key. Stored template rows and a fake competitor deleted. [log](log/part-6.5.md) |
| 6.6 | Radar reads the database | done | 8b937d7 + 2d4c8e7 (PR #7) + 5c792d7 | Radar reads stored rows and shows an empty state with counts on thin data. [log](log/part-6.6.md) |
| 6.7 | Scope markets, opportunities, competitors to a run | blocked | 85ecc11 | Run-scoped markets, opportunities, competitors and signals. Live two-run check waits on DEC-015. [log](log/part-6.7.md) |
| 6.8 | Evidence that belongs to the opportunity | blocked | db30a8e | Opportunity evidence is the signals matching its problem; stricter QC Rules 1 and 4. Live check waits on DEC-015. [log](log/part-6.8.md) |
| 6.9 | Batched extraction; a run that analysed nothing fails | blocked | 88fe435 | Batched extraction, 10 signals per call; a run that analysed under half fails. Live run waits on DEC-015. [log](log/part-6.9.md) |
| 6.10 | Deep runs as a background job | blocked | — | Waits on DEC-001 (job provider) and a measured post-6.9 run duration. [log](log/part-6.10.md) |
| 6.11 | Score honesty + calibration from stored competition checks | pending | — | Demand independent of the fetch limit, intent over analysed signals, calibration from stored competition checks. [log](log/part-6.11.md) |
| 6.12 | Ideas-first home + shared navigation | pending | — | Ideas-first home and one shared header. [log](log/part-6.12.md) |
| 6.13 | Lighter process docs | in_progress | — | STATE notes moved to docs/log, open-defects table added. The megalibrary path waits on DEC-016. [log](log/part-6.13.md) |
| 6.14 | Report pages: remove hard-coded PC copy and invented values | done | 878caea | Report pages show stored values or "Not observed"; panel counts equal the stored rows. [log](log/part-6.14.md) |

Order after DEC-014: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.11, 5.1, 6.12, 6.10, with 6.13 and 6.14 any time.
Phase 4 starts after 6.7 and 5.1. Details per part: `phases/phase-6-hardening.md`.

## Open defects

Known defects and their owner. A fixed defect leaves this table (its story stays in the part log).

| Defect | Found in | Owner |
|---|---|---|
| No chat model answers: extraction fails and no Deep run completes | 6.7 | DEC-015 (user) |
| Deep run does not fit a Vercel function; a timed-out step keeps writing | 3.8 | 6.10 |
| Deep Research dialog posts without a key and always gets 401 | 3.4 | 6.10, then 5.1 |
| Demand score saturates at 10 signals; engagement sums any numeric field | DEC-014 | 6.11 |
| Idea scores, card ticks and verdict thresholds are uncalibrated guesses | 3.6, 3.8 | 6.11 |
| Most stored budgeting "discussions" are Trends related-query rows | 6.8 | 6.11 |
| Home page is the explorer over old markets; no shared navigation | DEC-014 | 6.12 |
| Explorer header buttons overflow by 223 px at 375 px | 6.7 | 6.12 |
| `frontend-ai-megalibrary` path in `AGENTS.md` is missing on this machine | 3.10 | DEC-016 (user) |
| Production Reddit needs its own app id | 1.1 | DEC-005 (external approval) |
| Vercel project not connected to the repo for auto-deploys | 0.3 | unowned (user, dashboard) |
| Stored legacy markets keep an unvalidated trend (e.g. "accelerating" beside evidence saying "unknown") | 6.14 | unowned (data fix needs the user's yes) |
| Outline headings can repeat a theme ("why X is important" / "why X matters") | 3.6, 3.10 | unowned |
| Trends related queries bring off-topic ideas into a scan | 3.9 | unowned |
| Validate's competitor count can include listings stored by competition checks | 3.9 | unowned |
| `classifyFormat` reads "plan" as planner and defaults to guide | 6.4 | unowned |
| `observeCompetition` keeps only a run's first 10 listings | 6.7 | unowned |
| Radar plots `unknown` nodes; the client filter refetch can show an all-unknown radar | 6.6 | unowned |
| Quality panel lines R2 to R5 are fixed statements; completeness gives 15 points to any market page | 6.14 | unowned |
| Editing an adapter under `next dev` throws "SourceAdapter already registered" until restart | 3.9 | unowned (dev only) |
| The `claude / review` GitHub action fails to start on some pushes (PR #13) | 6.8 | unowned (user, CI) |

## Blockers / deferred

Entries point to DEC-IDs in `DECISIONS.md`.

- DEC-008 (resolved 2026-10-24, (a) local-only): long-tail phrase discovery source from the
  PDFMinter teardown (`docs/research/2026-10-24-pdfminter-teardown.md`). Production autocomplete
  needs a new decision; DEC-010 picked option (d) for production phrases (Part 3.7).
- DEC-009 (resolved 2026-10-24): the free-tier Supabase project had paused; the user restored it.
  It will pause again after about a week idle.
- DEC-010 (resolved 2026-10-24): feature scope from the competitor sweep
  (`docs/research/2026-10-24-competitor-sweep.md`) → Parts 3.7 to 3.11, rescoped 4.1 to 4.3, 5.4.
- DEC-011 (resolved 2026-10-24): optional `geo` on `CollectInput` for the per-scan region (Part 3.7).
- DEC-012 (resolved 2026-10-24, `openrouter/free`): the old free model was withdrawn. The account
  has $0 of credits purchased, so 50 free calls a day; one Deep run can use them all.
- YouTube template signals (fixed 2026-11-06): see [log/part-6.5.md](log/part-6.5.md).
- Blocked: Part 3.11 (score calibration) waits on the user's PDFMinter scan file in
  `docs/research/pdfminter-exports/`. Signed-in capture by the agent failed on Cloudflare
  Turnstile and was not worked around.
- DEC-015 (open, 2026-11-13): NVIDIA's `openai/gpt-oss-20b` stopped answering and OpenRouter's
  free pool returns nothing, so extraction fails and no Deep run completes. Blocks the live
  acceptance of 6.7, 6.8 and 6.9. Candidate models measured in the DEC entry.
