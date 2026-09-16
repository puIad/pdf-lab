# 02 — MASTER PLAN (all phases, DAG, MVP cut line)

PRD refs: §60 (Development Phases), §51–§52 (MVP scope + first algorithm), §50 (what NOT to build), §57 (roadmap).

## Phase DAG

```text
Phase 0 (foundation: repo, Next.js+Supabase+Vercel, env, CI gate)
  └─▶ Phase 1 (research engine: adapters, signals DB, extraction, clustering, evidence)
        ├─▶ Phase 2 (report: 25-opp generation, opportunity pages, citations, export)
        │     └─▶ ★ MVP GATE (PRD §62: "pc troubleshooting" → full report, ~zero cost)
        └─▶ Phase 3 (explorer: dashboard, search, radar, market pages) [needs Phase 1; pairs with Phase 2]
              └─▶ Phase 4 (monitoring: watchlists, schedules, alerts)
                    └─▶ Phase 5 (monetization: tiers, quotas, BYOK, premium)
                          └─▶ Phase 6 (hardening: QC metrics, usefulness tracking, launch)
```

Phases 2 and 3 both depend only on Phase 1 — they may interleave, but Phase 2 first is
recommended because the MVP gate lives there.

## Parts list (each = one short-prompt unit, one commit)

| ID | Part | Deps | PRD |
|---|---|---|---|
| 0.1 | Scaffold Next.js + Tailwind + shadcn/ui + repo hygiene | none | §36 |
| 0.2 | Supabase project + schema v1 + pgvector + RLS + env wiring | 0.1 | §36–§37 |
| 0.3 | Deploy to Vercel + CI gate (lint/typecheck/build) + env docs | 0.1, 0.2 | §36 |
| 1.1 | SourceAdapter interface + registry + Reddit adapter (read-only) | 0.2 | §10–§12 |
| 1.2 | Trends adapter + web-search adapter + normalized signal ingest | 1.1 | §11–§12 |
| 1.3 | AI extraction (intent/pain/audience/urgency/pdf_relevance) via AIRouter | 1.2 | §13–§14, §32–§33 |
| 1.4 | Problem clustering (pgvector) + market candidate scoring | 1.3 | §15–§16 |
| 1.5 | Evidence store + confidence + research_run lifecycle wiring | 1.4 | §30–§31, §38, §53–§55 |
| 2.1 | 25-opportunity generator (diversification constraints) | 1.5 | §18, §28–§29 |
| 2.2 | Opportunity + market report pages with citations | 2.1 | §19, §41, §47 |
| 2.3 | Competition analysis + review mining (Tier-2 marketplace adapters) | 2.1 | §20–§21 |
| 2.4 | Export (Markdown/CSV/JSON; PDF later) + research-quality panel | 2.2, 2.3 | §46, §55 |
| 3.1 | Market Explorer homepage (DB-backed table, evidence-derived scores) | 1.5 | §7 |
| 3.2 | Market search + market overview page | 3.1 | §8, §41–§42 |
| 3.3 | Find Trending Markets engine + Market Radar | 3.1 | §9, §22–§25 |
| 3.4 | Natural-language research + modes (Explore/Validate/Hunt/Deep/Monitor) | 3.2, 3.3 | §26–§27 |
| 4.1 | Saved markets / watchlist | 3.2 | §43 |
| 4.2 | Scheduled re-research (cron/scheduler) + change detection | 4.1 | §44, §24 |
| 4.3 | Alerts (in-app first; email/browser per PRD "optional") | 4.2 | §45 |
| 5.1 | Auth + tiers + quotas (anon / free / paid skeleton) | 0.3 | §49 |
| 5.2 | BYOK key vault + per-request routing + usage metering | 5.1 | §34 |
| 5.3 | Hosted-premium path + limits UX | 5.2 | §34, §49 |
| 6.1 | QC enforcement + confidence display + anti-gaming review | 2.4, 3.4 | §53–§54 |
| 6.2 | Success-metrics instrumentation (north-star + §58 events) | 6.1 | §58–§59 |
| 6.3 | Launch checklist: costs, abuse, legal/ToS, roadmap handoff | 6.2 | §50, §57 |

Total: **22 parts.** Each phase file repeats its rows with full task detail.

## MVP cut line (PRD §51–§52, §62)

MVP = Parts 0.1 → 2.2 (+ 2.4 export-min) passing this gate:

> Input `pc troubleshooting` → report with **25 genuinely distinct** PDF opportunities,
> each with evidence of real problems, buyer intent, trend signals, competition, market gaps,
> recommended format, source links, confidence levels — at close to zero dev cost
> (free quotas / local-open models).

Out of scope until after MVP (PRD §50): TikTok integration/scraping, social sentiment,
auto email alerts, purchasing data, big historical DB, teams, mobile app, auto PDF generation.

## Review gates

- **Part gate:** `REVIEW-CHECKLIST.md` all green.
- **Phase gate:** all parts `done` + phase-gate items in the phase file.
- **MVP gate:** demonstrated end-to-end run + `Research completeness` panel (§55) showing
  sources covered, signals analyzed, evidence-backed opportunity count.
- **Launch gate (Phase 6):** QC rules enforced in code (§53), confidence shown (§54),
  metrics events firing (§58), cost-per-run measured and documented.
