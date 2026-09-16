# PHASE 4 — Monitoring (watchlist → schedules → alerts)

Goal: markets that watch themselves. PRD refs: §24, §43–§45.
Phase gate: watched market → scheduled re-run → visible change report → in-app alert.

Load: Phase-3 files + `05-PIPELINE-SCORING.md → 09-UX-SPEC.md → guides/jobs-trigger-inngest.md`.

## Part 4.1 — Saved markets / watchlist

- Deps: 3.2. Touches: `app/watchlist/*`, `app/api/watchlist/*`, migration (watchlists table).
- Tasks:
  1. Migration: `watchlists(user_id, market_id, created_at, unique(user,market))` + RLS
     owner-only; bookmark toggle on market pages; "My Watchlist" view (PRD §43).
  2. Quota note: watchlist size capped per tier (limits enforced in Phase 5; constant in one place).
- Acceptance: bookmark/unbookmark persists per user; anonymous prompted to sign in
  (or local-only list explicitly labeled — DECIDE in part, log it).

## Part 4.2 — Scheduled re-research + change detection (DEC-001 lives here)

- Deps: 4.1. Touches: scheduler config, `lib/monitor/*`, `app/api/monitor/*`.
- Tasks:
  1. Resolve DEC-001 FIRST with run-duration data from Phases 1–3: Trigger.dev v4 vs
     Inngest vs Vercel Cron + route handlers. Record in DECISIONS.
  2. Per-watchlist cron re-runs (deep-lite: ingest→extract→trends→competition-delta).
  3. Change detector: discussion volume Δ, competitor count Δ, buyer-intent Δ, new
     discussions/complaints/products → change report per PRD §44
     ("PC Troubleshooting changed ↑… New opportunity detected …").
- Acceptance: forced re-run produces a change report with deltas reconciling to counts;
  missed-run backoff documented.

## Part 4.3 — Alerts (in-app first; email/browser optional per PRD §45)

- Deps: 4.2. Touches: `components/alerts/*`, `app/api/alerts/*` (+ migration if stored).
- Tasks:
  1. In-app alert feed ("AI-powered study planning crossed the opportunity threshold").
  2. Thresholds configurable per watch; email/browser STUBBED behind flags only
     (PRD §50 says skip auto-email for MVP — do not build sending here).
- Acceptance: threshold crossing → alert row; muting works; no email code paths active.
- Review: full checklist + Phase-4 gate.
