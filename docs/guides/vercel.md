# GUIDE — Vercel deploy + env (verified root 2026-09-16)

Source: https://vercel.com/docs. Next.js is Vercel's zero-config target.

## Deploy (Phase 0 Part 0.3)

1. Import repo in Vercel dashboard (or `vercel` CLI). Framework preset: Next.js.
2. Env vars — dashboard (per environment: Production / Preview / Development):
   - Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Server-only: `SUPABASE_SERVICE_ROLE_KEY`, provider keys (`GEMINI_API_KEY`,
     `OPENAI_*`, Bedrock creds, `OPENROUTER_API_KEY`), search API keys, cron secret.
3. Push to main → auto production deploy; PRs → preview deploys (used by CI gate).

## Rules

- Service-role + AI/search keys are NEVER `NEXT_PUBLIC_`, never in client bundles,
  never in `.env.example` (placeholders only). Full inventory in `docs/ENV.md`
  (created in Part 0.3).
- If Vercel Cron is chosen in DEC-001, its plan limits/timeouts constrain Part 4.2
  design — check CURRENT Vercel Cron docs then, not now.
