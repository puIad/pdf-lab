# PHASE 4 — Monitoring (watchlist → schedules → alerts)

Goal: markets that watch themselves. PRD refs: §24, §43–§45.
Phase gate: watched market → scheduled re-run → visible change report → in-app alert.

Load: Phase-3 files + `05-PIPELINE-SCORING.md → 09-UX-SPEC.md → guides/jobs-trigger-inngest.md`.

## Part 4.1 — Watchlist: markets, idea seeds, saved ideas

Rescoped 2026-10-24 (DEC-010): the watchlist also tracks quick-idea seeds and bookmarks single
ideas, the way PDFMinter's tracked topics and saved ideas work.

- Deps: 3.2, 3.7. Touches: `app/watchlist/*`, `app/api/watchlist/*`, migration (watchlists table).
- Tasks:
  1. Migration: `watchlists(user_id, kind market|seed|idea, ref, region, created_at,
     unique(user,kind,ref,region))` + RLS owner-only; bookmark toggle on market pages and idea
     cards, "track this seed" on `/ideas`; "My Watchlist" view grouped by kind (PRD §43).
  2. Quota note: watchlist size capped per tier (limits enforced in Phase 5; constant in one place).
- Acceptance: bookmark/unbookmark persists per user for all three kinds; anonymous prompted to
  sign in (or local-only list explicitly labeled — DECIDE in part, log it).

## Part 4.2 — Scheduled re-research + change detection (DEC-001 lives here)

- Deps: 4.1. Touches: scheduler config, `lib/monitor/*`, `app/api/monitor/*`.
- Tasks:
  1. Resolve DEC-001 FIRST with run-duration data from Phases 1–3: Trigger.dev v4 vs
     Inngest vs Vercel Cron + route handlers. Record in DECISIONS.
  2. Per-watchlist cron re-runs (deep-lite: ingest→extract→trends→competition-delta).
  3. Change detector: discussion volume Δ, competitor count Δ, buyer-intent Δ, new
     discussions/complaints/products → change report per PRD §44
     ("PC Troubleshooting changed ↑… New opportunity detected …").
  4. Tracked seeds (DEC-010): daily quick-ideas re-scan per seed and region, stored as a dated
     snapshot. The diff adds two trend bases: `new` (phrase first seen in this snapshot) and
     `history` (phrase demand moved between two dated snapshots), both carrying their dates
     (QC Rule 2). Cards show "N new this week".
- Acceptance: forced re-run produces a change report with deltas reconciling to counts; a forced
  seed re-scan marks injected new phrases `new` with dates; missed-run backoff documented.

## Part 4.3 — Alerts (in-app first; email/browser optional per PRD §45)

- Deps: 4.2. Touches: `components/alerts/*`, `app/api/alerts/*` (+ migration if stored).
- Tasks:
  1. In-app alert feed ("AI-powered study planning crossed the opportunity threshold").
  2. Thresholds configurable per watch; email/browser STUBBED behind flags only
     (PRD §50 says skip auto-email for MVP — do not build sending here).
  3. Weekly in-app digest (DEC-010): "N new ideas this week" across tracked seeds and markets,
     each line linked to its dated evidence.
- Acceptance: threshold crossing → alert row; muting works; the digest's counts reconcile to
  snapshot rows; no email code paths active.
- Review: full checklist + Phase-4 gate.
