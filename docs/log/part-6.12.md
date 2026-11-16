# Part 6.12 — Ideas-first home + shared navigation

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-014. Needs 6.7 for the runs list

Branch `phase-6-part-6.12`, cut from `phase-5-part-5.1` because the header links to `/login` and
`/account` and the runs list follows 5.1's run privacy. Spec: `docs/phases/phase-6-hardening.md`,
Part 6.12.

## What changed (2026-11-16)

1. One header in the root layout (`components/site-header/*`): the logo goes home, then Ideas
   (`/`), Markets (`/markets`), Research (`/research`), Radar (`/radar`), and Sign in or Account
   on the right. Radar is shown because 6.6 is done. The current section is marked with
   `aria-current`; `/search`, `/opportunities/*` and opportunity briefs count as Markets, `/deep`
   as Research. The signed-in label comes from the session cookie's presence only. The header is
   not sticky, so the market and opportunity pages keep their own sticky bars.
2. `/` is the quick-ideas scan (`IdeasView`) with a new intro: one line on what it does and the
   four steps from a topic to a brief (scan, Validate, competition check, brief). Recent seeds stay
   where they were. Below the scan, "Recent Deep runs" lists the last 6 Deep runs with their
   state: completed runs link to their markets, a run waiting for its pasted reply links back to
   `/deep?run=`. Runs are private (5.1): a person sees their own, a local dev server sees all, a
   signed-out visitor gets a sign-in line.
3. The explorer moved to `/markets` (`app/markets/page.tsx`). Its header lost the logo block and
   the Radar, Ask PDF Lab and Deep research buttons (the site header and the scanned seed carry
   them); it keeps Search markets. This removes the 223 px overflow at 375 px.
4. Deep research is offered from a scanned seed: the seed's button now reads "Go deeper on this
   seed", and a callout after the idea cards says what a Deep run does and that it uses one Deep
   run of the plan.
5. Old links: `/ideas?q=&region=` redirects to `/?q=&region=`, and `/?run=<id>` to
   `/markets?run=<id>`. The scan writes its URL on the page it ran from. Page-local back links
   that pointed at the old explorer home now go to `/markets` (search, market page, research
   summary, Deep results); the redundant back buttons on Research and Radar are gone; Deep's
   back link goes to Ideas with the seed filled in. `/?q=` fills the topic box and does not scan.
6. Pages use `flex-1` instead of `min-h-screen`, so a short page does not scroll by the header's
   height.

## Verification (2026-11-16)

- `pnpm test` 348 of 348; typecheck, eslint and `next build` green.
- Production build (`next start`, headless Chrome for Testing): `/`, `/markets`,
  `/markets?run=<id>`, `/markets/<id>`, `/opportunities/<id>`, `/research`, `/radar`, `/search`,
  `/deep`, `/login`, `/account` at 375 and 1280 px: all 200, 0 px horizontal overflow, 0 console
  errors, the right section marked in the header. `/ideas?q=budgeting&region=GB`, `/ideas` and
  `/?run=7963555f…` land on `/?q=budgeting&region=GB`, `/` and `/markets?run=7963555f…`.
- Click-only path on a dev server at 375 px: `/` → starter topic "budgeting" (scan: 71 ideas,
  autocomplete, Trends, Wikipedia) → Validate on the first card (GO or WAIT) → Brief →
  `/briefs/idea?seed=budgeting&phrase=budgeting%20planner`, heading "The Budgeting Planner",
  0 px overflow, 0 console errors. Two "Go deeper on this seed" links on the scanned seed.
- Recent Deep runs on the dev server listed the 6 newest runs: 5 completed with their market
  counts and the "local ai" run waiting for its reply.

## Observations

- The pages still carry their own titles and some keep a back link (account, login, search,
  market and opportunity pages). They are correct but partly redundant with the header.
- The signed-in label trusts the cookie's presence; an expired session shows Account until the
  proxy refreshes or clears it. `/account` itself checks the session.
