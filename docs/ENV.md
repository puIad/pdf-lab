# ENV — PDF Lab environment variable inventory (created Phase 0 Part 0.3)

Source of truth for every variable: what it is, where it is set
(local vs Vercel dashboard per environment), and rotation notes.
Rules override everything: **no real secret is ever committed to the repo,
in `.env.example` (placeholders only), in client bundles, or in chat.**

## Deploy layout (why two locations)

- PDF Lab lives at `Projects/PDF-Lab/` inside the `ai-os` repo. The Vercel
  project MUST set **Root Directory = `Projects/PDF-Lab`** at import time
  (dashboard → Project Settings → General → Root Directory). Framework preset:
  Next.js. `vercel.json` at the app root only pins the framework — install /
  build commands stay on Vercel zero-config auto-detect (pnpm via
  `packageManager` + `pnpm-lock.yaml`).
- Deploys are done by **Vercel's Git integration** (push to default branch →
  production; PRs → preview deploys). GitHub Actions (`pdf-lab-ci`) is a
  **gate only** (`pnpm lint` → `pnpm typecheck` → `pnpm build`) and never
  deploys — this avoids the known-broken `vercel build --prebuilt` path for
  pnpm monorepos outside Vercel infra (vercel/vercel#15204).
  Re-verified 2026-09-17 via Context7 (`/vercel/vercel` CI-automation +
  monorepo refs) and Exa search (Vercel KB "How can I use GitHub Actions
  with Vercel?", Vercel Academy monorepo CI).

## Variables

| Variable | Scope | Where set | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (safe in client bundle) | `.env.local` locally; Vercel dashboard → Production + Preview (+ Development if used) | Supabase project `pdf-lab` (ref `cjboiijclrwumgmgzvcl`, eu-west-3). Non-secret but environment-specific. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (safe in client bundle) | Same as above | Anon key is public by design; RLS is the real access control. Still never commit it. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only — NEVER `NEXT_PUBLIC_`, never imported client-side** | `.env.local` locally; Vercel dashboard → Production + Preview only | Full DB bypass. In Vercel, store as **Sensitive** type (production + preview targets; development target is not allowed for sensitive vars). Leaking this = full DB compromise → rotate immediately (Supabase dashboard → Settings → API → generate new key, then update both places). |
| `GEMINI_API_KEY` | Server-only | Not set yet (Phase 1 Part 1.3) | Placeholder in `.env.example` only. Set when AIRouter gains a Gemini provider. |
| `OPENAI_API_KEY` (and any `OPENAI_*`) | Server-only | Not set yet (Phase 1 Part 1.3) | Same as above, for an OpenAI-compatible provider path. |
| `OPENROUTER_API_KEY` | Server-only | Not set yet (Phase 1 Part 1.3) | Same as above, for the OpenRouter provider path. |
| Web-search API key (ONE of Brave / Serper / Tavily / Bing — DEC-002) | Server-only | Not set yet (Phase 1 Part 1.2) | Provider picked in Part 1.2; only the winner gets a key row here. |
| `CRON_SECRET` | Server-only | Not set yet (Phase 4 Part 4.2) | Only if Vercel Cron / scheduler path is chosen in DEC-001. |

## Local setup

```bash
cp .env.example .env.local   # then fill real values; .env.local is git-ignored
pnpm dev
```

`/api/health` reports `db.configured=false` with no env and
`db.sources=<n>` when the three Supabase vars are present — without leaking anything.

## Vercel setup (dashboard)

1. Import repo `puIad/ai-os`, set Root Directory to `Projects/PDF-Lab`, framework Next.js.
   (Part 0.3 created the project via API instead: project `pdf-lab`
   (`prj_s2iR7ouCA0Xknlsd0fnwFBfXiqJr`), framework `nextjs`, rootDirectory
   `Projects/PDF-Lab` — verified via API 2026-09-17.)
2. Environment Variables (per environment: Production / Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → all environments.
   - `SUPABASE_SERVICE_ROLE_KEY` → Production + Preview, **Sensitive** type.
3. Push to default branch → production deploy; open a PR → preview deploy + CI gate must be green.
4. Deployment Protection: API-created projects start with Vercel Authentication
   (SSO) on ALL deployments — Part 0.3 disabled it via
   `PATCH /v9/projects/:id {"ssoProtection": null}` so production
   (`https://pdf-lab-puiads-projects.vercel.app`) is public. Previews stay
   behind Standard Protection (login required), which is the Hobby default.
5. FOLLOW-UP (manual, one click): the project has no linked git repo
   (`link: null` via API 2026-09-17), so pushes/PRs do NOT auto-deploy yet —
   Part 0.3 deployed via API per event. In the dashboard go to Project →
   Settings → Git → Connect `puIad/ai-os` (keep Root Directory
   `Projects/PDF-Lab`). Preview builds themselves are proven
   (probe PR #1 → READY preview `dpl_FWoqjutLnCCuX6mJi1X8MTurm7bQ`, closed unmerged).

## Rotation

- Service-role or any AI/search key suspected leaked: generate a new key at the
  provider, update `.env.local` AND every Vercel environment holding it, then
  redeploy (vars take effect only on subsequent deployments — running
  deployments are not updated).
- Public anon key: rotate via Supabase dashboard the same way, but note RLS
  limits its blast radius.
