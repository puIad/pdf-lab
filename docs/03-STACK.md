# 03 — LOCKED STACK (verified 2026-09-16, re-verify on drift)

All versions below were read from official docs on 2026-09-16. If a version disagrees at
build time, that is a **decision-request trigger** (01-PHILOSOPHY §4a): log it, don't silently
upgrade/downgrade.

## Lock table

| Layer | Choice | Verified version / fact | Canonical docs |
|---|---|---|---|
| Frontend + backend | Next.js App Router (server routes first; FastAPI worker only if Phase 4+ needs it) | **Next.js 16.3.5** (docs `lastUpdated: 2026-07-21`); Node ≥20.9; Turbopack default bundler; `create-next-app` defaults = TS + Tailwind + ESLint + App Router + `@/*` + AGENTS.md | https://nextjs.org/docs + https://nextjs.org/docs/llms.txt |
| UI | Tailwind CSS (via create-next-app default) + shadcn/ui components | `pnpm dlx shadcn@latest init` then `pnpm dlx shadcn@latest add <component>`; import from `@/components/ui/*`; preset builder at `/create?template=next` | https://ui.shadcn.com/docs/installation/next |
| Database | Supabase Postgres + pgvector | Postgres with `pgvector` extension; embeddings in `vector` columns; RLS on user-data tables | https://supabase.com/docs (guides → AI → vector embeddings; verify exact guide slug at build time — slugs moved in 2026) |
| Background jobs | **Decision deferred to Phase 4 Part 4.2** — MVP uses Next.js route handlers + cron-pattern; candidates: Trigger.dev v4 / Inngest / plain cron | Trigger.dev **v4** (`@trigger.dev/sdk` 4.x; durable tasks, cron schedules, queues/concurrency, `maxDuration`, idempotency keys); do NOT use v2/v3 docs | https://trigger.dev/docs + https://trigger.dev/docs/llms.txt |
| Deployment | Vercel (free tier), production + preview envs | Env vars via dashboard/CLI; Next.js zero-config target | https://vercel.com/docs |
| AI layer | Model-agnostic `AIProvider` (OpenAI-compatible / Gemini / Bedrock / Ollama-local / OpenRouter). App calls generateText/generateObject-style methods behind our router | Cheap model = classification/tagging/dedup/intent/extraction; strong model = synthesis/reports/opportunities; embedding model = search/cluster/dedup (PRD §33). Free-quota/local-first in dev | Provider docs + `docs/07-AI-ROUTER.md` |
| Tier-1 sources | Reddit (read-only JSON/OAuth) + Google Trends (unofficial API — handle with care) + web search (Brave/Serper/Tavily/Bing — pick ONE free-tier in Phase 1 Part 1.2) | Reddit: authenticated scripts preferred over anon scraping; Trends: unofficial libs break — isolate behind adapter + cache aggressively | `docs/08-ADAPTERS.md` + `docs/guides/sources-reddit-trends-search.md` |
| Package manager | pnpm (matches shadcn + Next docs' primary examples) | `pnpm create next-app@latest`, `pnpm dev` | https://nextjs.org/docs/app/getting-started/installation |

## Scaffold commands (exact, from official docs)

```bash
pnpm create next-app@latest pdf-lab --yes
cd pdf-lab
pnpm dev   # http://localhost:3000
```

shadcn/ui into the scaffolded project:

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input badge tabs table dialog skeleton
```

## Principles (PRD §36, §61)

- Next.js server routes own the research engine until proven too heavy; only then add the
  Python/FastAPI worker — and only for heavy workloads, never as a rewrite.
- Every data source is an interchangeable adapter (PRD §10, §62-final). Cost/scale changes
  must never require rebuilding the engine.
- Never `User → LLM → Answer`. Always `User → Planner → Sources → Evidence DB →
  Analysis → LLM → Evidence-backed Report` (PRD §61).
