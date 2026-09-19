# STATE — live build tracker (update EVERY part, same turn)

Convention: `pending | in_progress | blocked | done`. Exactly ONE `in_progress`.
Done = code runs + acceptance met + review passed + commit hash recorded.

## Phase 0 — Foundation

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 0.1 | Scaffold Next.js + Tailwind + shadcn/ui + hygiene | done | bcc11dff | Next 16.3.5, 8 ui comps, /api/health 200; lint+tsc+build green 2026-09-16 |
| 0.2 | Supabase + schema v1 + pgvector + RLS + env | done | 1390511f | Live project pdf-lab (ref cjboiijclrwumgmgzvcl, eu-west-3, free); 10 tables + vector ext + RLS (6 policies) + 3 seed sources verified live; embedding/cosine probe dist 0; /api/health sources=3; lint/build green 2026-09-17; DEC-003 resolved |
| 0.3 | Vercel deploy + CI gate + env docs | done | ba559a1d + 11cea9c7 (+ docs-finalize, see log) | PROD https://pdf-lab-puiads-projects.vercel.app — /api/health 200 `{"ok":true,"schemaVersion":1,"db":{"configured":true,"sources":3}}`; pdf-lab-ci green on master (run 35198619359 success); preview builds proven (probe PR #1 → READY dpl_FWoqjutLnCCuX6mJi1X8MTurm7bQ, closed unmerged). Project prj_s2iR7ouCA0Xknlsd0fnwFBfXiqJr (nextjs, rootDir Projects/PDF-Lab); 3 Supabase envs set; ssoProtection nulled (prod public, previews SSO). CI fix: typecheck runs `next typegen` first (LayoutProps global needs generated route types; clean checkouts failed TS2304). 2 commits not 1 (build-then-fix; history truthful). FOLLOW-UP: connect repo in dashboard Git settings for auto-deploys (`link:null`). Spillover: `Projects/PDF-Lab/AGENTS.md` shows an uncommitted Docs-freshness block NOT authored this part — left untouched |

## Phase 1 — Research engine

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 1.1 | Adapter interface + registry + Reddit adapter | done | ca52d088 | Types+registry exact per 08-ADAPTERS; Reddit adapter (OAuth app-only + public fallback, sha256 authors, throttle/backoff/cache, healthCheck); GET /api/sources/health; fixture + 11 unit tests green (stub content-type fix this turn); lint+typecheck+build green 2026-09-17. Live acceptance via Composio-OAuth dev harness (DEC-006): 10 deduped `signals` rows source `reddit` (`pc troubleshooting`), leaks:none, rerun dedup proven (count stays 10). Prod collect() still awaits own app-id (DEC-005 approval); zero code change when it lands. |
| 1.2 | Trends + web-search adapters + ingest | done | 9ca1f9e0 | DEC-002 resolved: Serper (2.5k free, no card; Brave/Tavily/Bing rejected); gtrends adapter (google-trends-api 4.9.2 pinned, verified live, isolated/24h-cache/graceful) + web adapter (Serper-keyed, honest skipped) + ingest (collect→normalize→dedup→insert, POST /api/ingest per-source counts); 37/37 tests, lint+typecheck+build green 2026-09-17. Live `pc troubleshooting`: gtrends 2 rows, web 8 rows (Composio-Exa harness via real normalize, DEC-006 pattern), reruns dup-proven, reddit still blocked-pending-approval (rows intact: 10/2/8). Prod web needs SERPER_API_KEY (zero code change); prod reddit needs own app-id (DEC-005). SERPER key installed + verified live 2026-09-17 (health ok, 5 fresh rows; restart dev server to pick it up). |
| 1.3 | AI extraction via AIRouter | done | a9b084a | AIRouter (providers: ollama, openrouter, openai-compatible), schema validator, runExtractionJob, POST /api/extract; 53/53 tests pass, lint+typecheck+build green. Live acceptance: 25/25 stored signals extracted via OpenRouter (nex-agi/nex-n2.5-pro:free, cost $0), 25 upserted to signal_analysis, 0 failures, intent/urgency/pdf_relevance validated and spot-checked against PRD §14 ladder. |
| 1.4 | Clustering (pgvector) + market scoring | done | 5127c69 | AIRouter.embed (1536-dim via OpenRouter text-embedding-3-small); cosine similarity clustering (PRD §15 shape); evidence-backed scoring (Demand×Momentum×Frequency×Intent×PDFfit ÷ Density) + confidence gates; PDF suitability check (PRD §17); POST /api/cluster; 62/62 tests pass, lint+typecheck+build green. Live acceptance: 25 signals embedded (1536-dim in signal_analysis.embedding), clustered into 14 distinct problem markets persisted in markets and market_signals; confidence low (<0.35) for thin clusters, monotonic scaling proven. |
| 1.5 | Evidence store + confidence + run lifecycle | pending | — | |

## Phase 2 — Report (★ MVP gate after 2.2 + export-min)

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 2.1 | 25-opportunity generator | pending | — | |
| 2.2 | Opportunity + market report pages + citations | pending | — | ★ MVP gate |
| 2.3 | Competition + review mining (Tier-2 adapters) | pending | — | |
| 2.4 | Export (MD/CSV/JSON) + quality panel | pending | — | |

## Phase 3 — Explorer

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 3.1 | Explorer homepage (DB-backed) | pending | — | |
| 3.2 | Market search + overview page | pending | — | |
| 3.3 | Trending engine + Radar | pending | — | |
| 3.4 | NL research + modes | pending | — | |

## Phase 4 — Monitoring

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 4.1 | Watchlist | pending | — | |
| 4.2 | Scheduled re-research + change detection | pending | — | DEC-001 decided here |
| 4.3 | Alerts (in-app first) | pending | — | |

## Phase 5 — Monetization

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 5.1 | Auth + tiers + quotas | pending | — | |
| 5.2 | BYOK vault + routing + metering | pending | — | |
| 5.3 | Hosted-premium + limits UX | pending | — | |

## Phase 6 — Hardening

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 6.1 | QC enforcement + confidence display | pending | — | |
| 6.2 | Metrics instrumentation (§58–§59) | pending | — | |
| 6.3 | Launch checklist + handoff | pending | — | |

## Blockers / deferred

(none yet — entries point to DEC-IDs in `DECISIONS.md`)
