# Part 5.1 — Auth + tiers + quotas

Branch `phase-5-part-5.1`. Spec: `docs/phases/phase-5-monetization.md`, Part 5.1. PRD §49.

## What was built

1. Sign-in by email link (Supabase Auth, no password). `/login` sends the link with
   `signInWithOtp`; the link lands on `/auth/confirm`, which takes either `?code=` (PKCE) or
   `?token_hash=&type=` and sets the session cookie, then goes to `next` (a path on this site
   only: `//host` and `/\host` fall back to `/`). `POST /auth/signout` ends the session.
   `/account` shows the email, the plan and each limit with its reset date.
2. `proxy.ts` (Next 16's middleware) refreshes an expired Supabase token before any page or
   route runs. It decides nothing about access.
3. Plans and limits in `lib/quotas/quotas.ts`, pure and unit tested (`quotas.test.ts`):

   | Kind | anon | free | premium |
   |---|---|---|---|
   | search (`/api/search`, `/api/research` non-deep modes) | 3 a day | 30 a day | 300 a day |
   | exploration (`/api/ideas`) | sign in | 5 a month | 100 a month |
   | check (`/api/ideas/competition`, `/api/briefs/notes`) | sign in | 20 a month | 400 a month |
   | deep (`/api/deep`) | sign in | 1 a month | 20 a month |

   anon, free exploration and free deep follow the spec. The search and check caps and every
   premium number are placeholders until the usage ledger has data (5.3). Windows are UTC: a day
   resets at midnight, a month on the 1st.
4. `lib/quotas/guard.ts`: `resolveCaller` returns the server key (`x-api-key` =
   `INTERNAL_API_KEY`), a signed-in user (plan from `public.users`), a signed-out visitor (HMAC of
   the first `x-forwarded-for` address; the address is never stored), or, on a dev server, a
   signed-out developer who is not counted. `enforceQuota` counts `usage_events` rows in the
   window, refuses with 401 (kind not in the plan) or 429 (limit reached, with the reset date),
   and records a row only when the action is allowed. If the count cannot be read it refuses
   with 503 instead of running uncounted.
5. Migration `20261116000009_auth_quotas.sql` (applied to `cjboiijclrwumgmgzvcl` as
   `20261116075428`): `users_plan_check`, a trigger that makes the `public.users` row when an
   auth user is created, and `usage_events` (service-role only). Documented in `04-SCHEMA.md`.
6. Runs belong to the person who started them: `/api/deep` and `/api/search` store the
   caller's user id; `GET /api/runs`, `GET /api/runs/[id]`, `GET/POST /api/deep/[runId]` and
   search history show a person only their own runs (the server key and a dev server see all;
   signed out sees none). `/api/research` takes `user_id` from the body only with the server key.
7. UI: every view that called a guarded endpoint now shows the server's refusal text (sign in,
   limit reached with the reset date, someone else's run) in place of the old "needs the
   internal key" messages. `/search?q=` opened by URL is counted like an API search, and the
   search box updates the URL with `history.pushState` so a search is not run (and counted)
   twice. `/deep?run=` reopens a run only for its owner. Remaining counts are on `/account`
   only; showing them next to each action is 5.3's limits UX.

This closes the 6.15 defect "`/deep` and `/api/deep` need the internal key when deployed": a
signed-in user now runs pasted Deep runs in production, within the plan's limit.

## Endpoint audit (every route under `app/`)

| Route | Guard |
|---|---|
| `POST /api/search`, `GET /api/search?q=` | `search` |
| `POST /api/research` (explore, validate, hunt, monitor) | `search` |
| `POST /api/research` (deep, one request) | server key only |
| `POST /api/ideas` | `exploration` |
| `POST /api/ideas/competition`, `POST /api/briefs/notes` | `check` |
| `POST /api/deep` | `deep` |
| `GET/POST /api/deep/[runId]` | owner of the run (counted when it started) |
| `POST /api/ingest`, `/api/extract`, `/api/cluster`, `/api/opportunities/generate`, `/api/runs` | server key only |
| `GET /api/sources/health` | server key or dev server (each probe is a real Serper call) |
| `GET /api/runs`, `GET /api/runs/[id]`, `GET /api/search?history=true` | caller's own runs |
| `GET /api/markets`, `/api/radar`, `/api/topics/solvable`, `/api/trends/delta`, `/api/trends/seasonal`, `GET/POST /api/export`, `POST /api/briefs/export`, `GET /api/health` | open: they read stored public rows and call no model or paid source |
| `/auth/confirm`, `POST /auth/signout` | open (sign-in itself) |

## Verification (2026-11-16)

- `pnpm test`: 348 of 348. `typecheck`, `eslint`, `next build`: green.
- Live check on `next start` (production mode) on localhost against the live database, script
  kept outside the repo. One test auth user made with the admin API (no email sent) and signed
  in through `/auth/confirm` with its link token. 31 of 31 passed:
  - Signed out: 3rd search of the day allowed (`remaining=0`), 4th refused with 429 "Signed-out
    limit reached: 3 of 3 searches used this day. Resets 17 November 2026 (UTC). Sign in for
    more.", and the refused search wrote no row. Ideas, competition check, Deep and brief notes
    refused with 401 and the free plan's allowance. The five pipeline endpoints, one-request
    Deep and `/api/sources/health` refused with 401. Run list and search history empty;
    `/api/runs/<id>` of a run refused with 403.
  - Email link: 307 to `/account` with an `sb-` session cookie; a bad token goes to
    `/login?error=…`; the trigger made the `public.users` row on the free plan.
  - Free: search counted (`limit 30, remaining 29`) and the run saved with the user's id. With
    one Deep run used this month, `/api/deep` refused with 429 "Free plan limit reached: 1 of 1
    Deep runs used this month. Resets 1 December 2026 (UTC)." before collecting anything. 6th
    idea scan of the month refused the same way.
  - Reset: the used Deep run moved to 20 October; `/account` reads "Deep runs 0 of 1 used, 1
    left this month".
  - Own runs: run list has only the user's run; own run by id 200, another's 403; another's
    Deep run 403.
  - Premium: `plan` set to premium, the next search reports `limit 300`.
  - Sign out: 303 home, session cookie cleared.
  - Cleanup: test runs, usage rows, `public.users` row and auth user deleted; afterwards
    `auth.users` 0, `public.users` 0, `usage_events` 0.
- Screenshots of `/login` and `/account` at 1280 and 375 px: no horizontal overflow.

## Observations

- Shortcut in `guard.ts`: count, then insert. Two requests in the same instant can both pass at
  the limit. Move the count into one SQL statement if that is ever abused.
- `public.users` has no foreign key to `auth.users`. Deleting an auth user leaves its row, and a
  new sign-up with the same email then gets no `public.users` row (the email is unique), so its
  usage rows fail to save and every counted action answers 503. No flow deletes accounts yet.
- Not checked: the Supabase Auth URL settings (site URL and redirect allow list) for the
  production domain. The email link sends people to `<origin>/auth/confirm`; if the deployed
  origin is not allowed, Supabase falls back to the site URL.
- `INTERNAL_API_KEY` is not in `.env.local`, so on a local production build no caller is
  "internal"; scripts that call the pipeline endpoints need it set.
