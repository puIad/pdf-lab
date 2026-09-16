# PHASE 0 — Foundation (repo, app shell, data project, deploy)

Goal: a deployed, CI-gated Next.js + Supabase skeleton that later phases build on.
PRD refs: §36 (stack), §37 (schema — v1 here). Phase gate: Vercel URL live, `/health`
returns schema version, lint+typecheck+build green, no secrets in repo.

Load before starting: `00-START-HERE.md → 01 → STATE.md → 03-STACK.md → 04-SCHEMA.md →
guides/nextjs.md, guides/shadcn-tailwind.md, guides/supabase-pgvector.md, guides/vercel.md`.

## Part 0.1 — Scaffold Next.js + Tailwind + shadcn/ui + repo hygiene

- Deps: none. Touches: repo root, `AGENTS.md`/`CLAUDE.md` (agent pointers to docs/).
- Tasks:
  1. `pnpm create next-app@latest pdf-lab --yes` (TS + Tailwind + ESLint + App Router +
     `@/*` — verified defaults, Next.js 16.3.5 docs).
  2. `pnpm dlx shadcn@latest init`, then `add button card input badge tabs table dialog skeleton`.
  3. Add `app/api/health/route.ts` → `{ ok: true, schemaVersion: 1 }`.
  4. Add `AGENTS.md` (or extend) pointing agents at `docs/00-START-HERE.md` load order.
  5. `.gitignore` (env, node_modules, .next), `.env.example` with placeholder keys only.
- Acceptance: `pnpm dev` serves home; `/api/health` 200; components import from
  `@/components/ui/*`; `pnpm lint && pnpm build` green.
- Review: checklist A–D. STATE: mark 0.1 `done` + hash.
- Guides: `guides/nextjs.md`, `guides/shadcn-tailwind.md`.

## Part 0.2 — Supabase project + schema v1 + pgvector + RLS + env wiring

- Deps: 0.1. Touches: `supabase/migrations/*`, `lib/db/*`, `.env.example`.
- Tasks:
  1. Create Supabase project (free tier); save URL + anon key + service-role key
     (service-role server-only, never `NEXT_PUBLIC_`).
  2. Migration 1: `users, sources, signals, signal_analysis (embedding dim per 07-AI-ROUTER;
     default 1536), markets, market_signals, opportunities, competitors, evidence,
     research_runs` exactly per `04-SCHEMA.md` + `create extension vector`.
  3. RLS: public read on markets/opportunities/competitors/evidence/sources; owner-only
     users; service-role for run-owned tables in MVP (tighten in Phase 5).
  4. Seed `sources` rows for `reddit, gtrends, web` (status active) + `lib/db/client.ts`
     (typed Supabase clients: browser/server/service).
  5. `/api/health` now also checks DB (sources count) without leaking secrets.
- Acceptance: migration applies to fresh project; RLS verified with anon vs service
  queries; embedding insert + cosine query works; keys only in env.
- Review: checklist incl. C (schema == 04).STATE: 0.2 `done` + hash.
- If Supabase guide slug/API differs from `guides/supabase-pgvector.md`: DECISION REQUEST,
  don't improvise.
- Guides: `guides/supabase-pgvector.md`.

## Part 0.3 — Deploy to Vercel + CI gate + env docs

- Deps: 0.1, 0.2. Touches: Vercel project, CI config, `docs/ENV.md` (create).
- Tasks:
  1. Connect repo to Vercel; set server-only + public env vars per `.env.example`.
  2. CI (GitHub Actions or Vercel checks): `pnpm lint`, `tsc --noEmit`, `pnpm build` —
     PRs blocked on red.
  3. Write `docs/ENV.md`: every variable, where set (local/Vercel), rotation notes.
  4. Record production URL in `STATE.md` notes for 0.3.
- Acceptance: push to main → green CI → live URL; `/api/health` 200 in production;
  preview deploys work for PRs.
- Review: full checklist. Phase-0 gate re-check (all three acceptances hold).
- Guides: `guides/vercel.md`.
