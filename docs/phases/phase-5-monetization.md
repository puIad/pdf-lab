# PHASE 5 — Monetization (tiers, quotas, BYOK, premium)

Goal: sustainable free tier + paid headroom, priced from measured costs.
PRD refs: §34, §49. Phase gate: anon throttled, free quotas enforced, BYOK routes and
meters correctly, premium path priced from real per-run data.

Load: Phase-4 files + `07-AI-ROUTER.md → guides/ai-providers.md`.

## Part 5.1 — Auth + tiers + quotas

- Deps: 0.3 (env/auth groundwork). Touches: auth (Supabase Auth), `lib/quotas/*`, middleware.
- Tasks:
  1. Supabase Auth (email link first); plans: anon (1–3 basic searches/day) / free
     (~5 explorations + 1 deep run/month, limited history/monitoring) / paid skeleton
     (higher limits — exact numbers post-usage-data per §49).
  2. Quota middleware on ingest/extract/generate/search endpoints; honest limit UX
     (remaining counts, reset dates); abuse basics (rate limit, run caps).
- Acceptance: quota tests (anon over-limit blocked; free deep-run 2nd/month blocked;
  counters reset); no endpoint bypasses middleware (audit list in PR).

## Part 5.2 — BYOK key vault + routing + metering

- Deps: 5.1. Touches: `lib/keys/*` (+ migration), `lib/ai/*` router update, usage ledger.
- Tasks:
  1. Encrypted per-user keys (Gemini / OpenAI-compatible / Bedrock / OpenRouter);
     never logged, never client-exposed; rotation + delete flows.
  2. Router prefers user key when present (Mode 2, PRD §34); fallback to hosted quota
     with clear labeling of which key paid for a run.
  3. Usage ledger: tokens/calls/cost-estimate per run per user (started in 1.3, now
     authoritative) — feeds 5.3 pricing.
- Acceptance: BYOK run bills provider key (provider dashboard cross-check documented);
  revoked key → clean error + fallback message; ledger reconciles on sample runs.

## Part 5.3 — Hosted-premium path + limits UX

- Deps: 5.2. Touches: billing stub, `components/limits/*`.
- Tasks:
  1. Premium checkout STUB (provider TBD — Stripe/Paddle decision = DEC entry if reached;
     do not integrate blindly): entitled plan flips limits, logged.
  2. Limits UX: upgrade prompts with measured cost basis ("a deep run costs ~$X at
     current usage" from ledger data).
  3. Cost-per-run dashboard (internal) from ledger.
- Acceptance: stub upgrade → limits change; ledger shows per-run cost within documented
  bounds; no real charges possible in stub mode (assert in code + review).
- Review: full checklist + Phase-5 gate.
