# LOCKED STACK (verified 2026-09-16, re-verify on drift)

All versions below were read from official docs on 2026-09-16. If a version disagrees at
build time, that is a **decision-request trigger** (`README.md`): log it, don't silently
upgrade/downgrade.

## Lock table

| Layer | Choice | Verified version / fact | Canonical docs |
|---|---|---|---|
| Frontend + backend | Next.js App Router (server routes first; FastAPI worker only if Phase 4+ needs it) | **Next.js 16.3.5** (docs `lastUpdated: 2026-07-21`); Node ≥20.9; Turbopack default bundler; `create-next-app` defaults = TS + Tailwind + ESLint + App Router + `@/*` + AGENTS.md | https://nextjs.org/docs + https://nextjs.org/docs/llms.txt |
| UI | Tailwind CSS (via create-next-app default) + shadcn/ui components | `pnpm dlx shadcn@latest init` then `pnpm dlx shadcn@latest add <component>`; import from `@/components/ui/*`; preset builder at `/create?template=next` | https://ui.shadcn.com/docs/installation/next |
| Database | Supabase Postgres + pgvector | Postgres with `pgvector` extension; embeddings in `vector` columns; RLS on user-data tables | https://supabase.com/docs (guides → AI → vector embeddings; verify exact guide slug at build time — slugs moved in 2026) |
| Background jobs | Vercel Workflow for durable steps, Vercel Cron for schedules (DEC-001, resolved 2026-11-16) | `workflow` 5.6.1 (verified 2026-11-20, issue #24). A step may run as long as the plan's function limit (Hobby 300 s, Pro 800 s), a run has no overall limit, `sleep` is unlimited. Hobby cron runs once a day only | https://vercel.com/docs/workflows + https://vercel.com/docs/cron-jobs |
| Deployment | Vercel (free tier), production + preview envs | Env vars via dashboard/CLI; Next.js zero-config target | https://vercel.com/docs |
| AI layer | Model-agnostic `AIProvider` (OpenAI-compatible / Gemini / Bedrock / Ollama-local / OpenRouter). App calls generateText/generateObject-style methods behind our router | Cheap model = classification/tagging/dedup/intent/extraction; strong model = synthesis/reports/opportunities; embedding model = search/cluster/dedup (PRD §33). Free-quota/local-first in dev | Provider docs + `docs/AI-ROUTER.md` |
| Tier-1 sources | Reddit (read-only JSON/OAuth) + Google Trends (unofficial API — handle with care) + web search (Brave/Serper/Tavily/Bing — pick ONE free-tier in Phase 1 Part 1.2) | Reddit: authenticated scripts preferred over anon scraping; Trends: unofficial libs break — isolate behind adapter + cache aggressively | `docs/ADAPTERS.md` |
| Brief DOCX export (Part 3.10) | `docx` (dolanmiu), pinned | **docx 9.13.0** (published 2026-10-19; 9.15.2 is latest but under two weeks old on 2026-11-06). API used: `Document`, `Paragraph` (`heading`, `bullet`, `indent`), `TextRun`, `ExternalHyperlink`, `Packer.toBuffer`; checked on Context7 `/dolanmiu/docx` | https://docx.js.org + https://github.com/dolanmiu/docx |
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
