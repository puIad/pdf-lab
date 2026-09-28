# PDF Lab

> **Status: in development.** A personal project, built in public. Expect rough edges, schema
> changes and half-finished phases. Live progress is tracked in [`docs/STATE.md`](docs/STATE.md).

PDF Lab is a market-research engine for digital PDF products (guides, checklists, templates,
workbooks). You give it a niche, and it collects real discussions, search trends and marketplace
listings. From those it pulls out the pains and buyer intent, groups them into problem markets,
and suggests PDF opportunities.

It follows one rule above all: **evidence before synthesis.** Every score, trend label, demand
claim and opportunity links back to stored evidence rows (source, URL, date, excerpt). If nothing
was observed, the UI shows "not observed" rather than guessing.

## What works today

- **Research pipeline**: source adapters (Reddit, Google Trends, web search, Etsy/Gumroad/KDP via
  search, YouTube) → AI extraction → pgvector clustering → evidence-backed scoring → a 10-state
  run lifecycle with a completeness panel.
- **Report**: 25 diverse, evidence-backed opportunities per deep run, market and opportunity
  pages with citations, competition and review mining, and Markdown/CSV/JSON export.
- **Explorer**: a DB-backed market table, market search with the PRD §8 overview, and a
  4-window trend radar.
- **Ask PDF Lab** (`/research`): natural-language questions turn into a structured query, which
  runs in one of five modes:
  - **Explore**: a broad scan of stored evidence
  - **Validate**: tests *your* concept on demand, audience, complaints, products, pricing, gaps and risks
  - **Hunt**: filters for openings such as high intent or low competition
  - **Deep**: the full `pdf-lab <niche>` pipeline
  - **Monitor**: a 7d/30d/90d/12m trend snapshot

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 + shadcn/ui (Base UI) · Supabase (Postgres +
pgvector + RLS) · model-agnostic AI router (OpenRouter / Ollama / OpenAI-compatible) · Vercel.

## Running locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + model keys (see docs/ENV.md)
pnpm dev
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## How the project is organised

`docs/` is the source of truth. Start with [`docs/00-START-HERE.md`](docs/00-START-HERE.md).
The work is split into phases and parts (`docs/02-MASTER-PLAN.md`), and each part lands as one
commit named `phase-<N>-part-<M>: …`, so `git log` follows the plan.

## Roadmap

Next up are watchlists, scheduled re-research and alerts (Phase 4). After that come accounts,
quotas and bring-your-own-key model routing (Phase 5), then hardening and launch (Phase 6).
