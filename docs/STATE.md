# STATE — live build tracker (update EVERY part, same turn)

Convention: `pending | in_progress | blocked | done`. Exactly ONE `in_progress`.
Done = code runs + acceptance met + review passed + commit hash recorded.

## Phase 0 — Foundation

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 0.1 | Scaffold Next.js + Tailwind + shadcn/ui + hygiene | done | — | Next 16.3.5, 8 ui comps, /api/health 200; lint+tsc+build green 2026-09-16 |
| 0.2 | Supabase + schema v1 + pgvector + RLS + env | pending | — | |
| 0.3 | Vercel deploy + CI gate + env docs | pending | — | |

## Phase 1 — Research engine

| Part | Title | Status | Commit | Notes |
|---|---|---|---|---|
| 1.1 | Adapter interface + registry + Reddit adapter | pending | — | |
| 1.2 | Trends + web-search adapters + ingest | pending | — | DEC-002 decided here |
| 1.3 | AI extraction via AIRouter | pending | — | |
| 1.4 | Clustering (pgvector) + market scoring | pending | — | |
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
