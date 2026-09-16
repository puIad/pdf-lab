# GUIDE — Background jobs: Trigger.dev v4 vs Inngest vs cron (verified 2026-09-16)

Sources: https://trigger.dev/docs (+ `/docs/llms.txt`). Inngest: re-verify at
https://www.inngest.com/docs in Phase 4 (deep URLs moved; earlier fetch 404'd).

## Decision status

DEFERRED to Phase 4 Part 4.2 (DEC-001). MVP (Phases 0–3) uses route handlers + cron-pattern
only. Do NOT add a job provider earlier.

## Verified facts (Trigger.dev)

- Current major: **v4** (`@trigger.dev/sdk` 4.x). `/docs/v2`, `/docs/v3` are SUPERSEDED —
  never follow them.
- Model: durable tasks run on Trigger.dev infra (NOT inside serverless fns — platform
  timeouts not in path); runs until finish; `maxDuration` caps (min 5s); automatic
  configurable retries; FAILED vs CRASHED (OOM) terminal states; idempotency keys
  dedup triggers/waits; queues + per-tenant concurrency; cron schedules with timezone;
  atomic deploys (in-flight runs unaffected); core Apache-2.0 + SDK MIT (self-hostable).
- LLM observability covers Vercel AI SDK calls (`generateText/streamText/generateObject`)
  only — raw fetch/provider SDKs are NOT captured (matters for 07-AI-ROUTER metering).

## At decision time (Part 4.2), compare on

1. Max run duration vs measured Phase 1–3 runs; 2. free-tier limits + $/overage;
3. cron/timezone + retry/idempotency needs; 4. self-host requirement; 5. Vercel Cron
simplicity if runs fit platform limits. Record the matrix in DEC-001, then implement per
the chosen provider's CURRENT quickstart (don't trust memorized snippets).
