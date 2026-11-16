# Part 4.1 — Watchlist

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

Rescoped by DEC-010: markets, idea seeds, saved ideas

Branch `phase-4-part-4.1`, cut from `master` after 5.1 and 6.12 merged. Spec:
`docs/phases/phase-4-monitoring.md`, Part 4.1. PRD §43.

## Decided in this part (2026-11-16)

The phase file left one choice to the part: a signed-out visitor is either asked to sign in or
gets a browser-only list labelled as such. Decision: **asked to sign in, no browser-only list**.

- 4.2 re-scans tracked seeds on a schedule and 4.3 raises alerts from them. Both run on the
  server, so a list that lives in one browser could never be re-scanned or alerted on.
- A signed-out visitor cannot run an idea scan at all (5.1: idea scans need an account), so the
  only watchlist control they can reach is Watch market on a market page.
- A second store would need a merge step at sign-in. Nothing asks for that.

## What was built

1. Migration `20261116000010_watchlists.sql` (applied to `cjboiijclrwumgmgzvcl` as
   `20261116090243`): table `watchlists`, documented in `04-SCHEMA.md`.
   - `kind` is `market`, `seed` or `idea`. `ref` is the market id, the seed, or the idea's search
     phrase. `region` is the scan region for a seed or idea and `''` for a market: it is not
     nullable because two nulls would not collide in `unique (user_id, kind, ref, region)`.
   - One column more than the phase file lists: `seed`, set for an idea only. A phrase alone
     cannot lead back to the scan that showed it, so the row keeps the seed it came from.
   - Row level security is on with three owner-only policies (select, insert, delete; no
     update). All grants are revoked from `anon` and `authenticated`, then select, insert and
     delete are granted to `authenticated`: per the Supabase docs a policy does not take the
     default grants back, so both layers are set.
2. `lib/watchlist/watchlist.ts`, pure and unit tested: `parseWatch` checks a request (kind, a
   market ref that is an id, seed 2 to 80 characters, phrase 2 to 160, a listed region, an idea's
   seed) and lowercases seeds and phrases; `watchKey` is the string the UI uses to know what is
   already saved.
3. `lib/watchlist/store.ts`: `listWatches` reads the rows as the signed-in person (session
   cookie and anon key, not the service role), so the table's policies are what limits the
   result. `watchKeys` is the same list as keys for a page's toggles.
4. `GET / POST / DELETE /api/watchlist`. The caller comes from `resolveCaller` (5.1). Signed out,
   the server key and a signed-out dev server all get 401 "Sign in to keep a watchlist.": a
   watchlist needs a user id. POST of a row already saved answers 200 and adds nothing. POST at
   the plan's cap answers 429.
5. Cap, in one place: `WATCHLIST_LIMIT` in `lib/quotas/quotas.ts`, free 25 and premium 250 rows
   in all. Both numbers are placeholders like 5.1's search and check caps.
6. `components/watchlist/watch-toggle.tsx`, built from the `Button` primitive: one button that
   saves or removes a row and shows the server's refusal under it. On 401 the message carries a
   Sign in link to `/login?next=<this page>`.
   - Market report page: Watch market / Watching, next to the trend and confidence badges.
   - Scan results on `/`: Track this seed / Tracking this seed, next to the CSV button.
   - Idea card: Save / Saved, with the card's other actions.
   The home page and the market page read the person's saved keys on the server, so the buttons
   start in the right state.
7. `/watchlist`, "My watchlist": three groups (Markets, Tracked seeds, Saved ideas), each with
   its count, the plan's cap ("3 of 25 saved on the free plan") and a Remove button per row. A
   market row links to its report, a seed row to its scan (`/?q=&region=`, which fills the box
   and does not run or count a scan), an idea row to the scan it came from. The page states
   that saved rows are not re-scanned yet. Signed out it shows a sign-in prompt.
8. Header: a Watchlist link on the right, before Sign in or Account. It is an icon below 768 px.
   The phone spacing of the header was tightened (link padding 6 px, no gap between the two
   icons) so the four sections and both icons fit from 360 px up; before this part the header
   also needed 360 px.

Files outside the phase file's "touches" list, all required by its task 1 or 2:
`app/page.tsx`, `app/ideas/ideas-view.tsx`, `app/markets/[id]/page.tsx` (the toggles),
`components/site-header/*` (the link), `lib/quotas/quotas.ts` (the cap), `lib/watchlist/*`,
`components/watchlist/*`.

## Verification (2026-11-16)

- `pnpm test` 357 of 357 (5 new in `lib/watchlist/watchlist.test.ts`), `pnpm typecheck`,
  `pnpm lint`, `pnpm build`: green.
- Database after the migration: RLS on, the three policies present for `authenticated`, grants
  to `authenticated` are select, insert, delete only, none to `anon`.
- Live check on `next start` (production mode) on localhost against the live database, script
  kept outside the repo. Two test accounts made with the admin API (no email sent), signed in
  through `/auth/confirm` with a link token. **38 of 38**:
  - Signed out: GET, POST and DELETE answer 401; `/watchlist` shows the sign-in prompt with a
    link to `/login?next=%2Fwatchlist`; the market page reads Watch market.
  - Account A saves a market, a seed and an idea: three rows stored, seed and phrase
    lowercased, the idea with its seed, the market with region `''`. Saving the same seed again
    adds nothing; the same seed in another region is its own row. A new request lists all four,
    `/watchlist` shows them with "4 of 25 saved", the market page reads Watching.
  - Account B sees none of A's rows, the market A watches reads Watch market for B, B saves the
    same seed as A, and B removing A's market changes nothing for A.
  - The table without the app, with A's token against the Data API: A reads only A's 4 rows;
    inserting a row for B is refused (403, 42501 "new row violates row-level security policy");
    deleting B's rows deletes none; an update is refused (403); the anon key alone is refused
    (401, 42501).
  - Removing the seed, the market and the idea each takes its row out, and the market page
    reads Watch market again.
  - Bad kind, bad JSON, a market ref that is not an id and an idea without its seed: 400.
  - Cap: at 25 of 25 a new row is refused with 429 "Your watchlist is full: 25 of 25 saved on
    the free plan. Remove one to add another."; a row already saved still answers 200; with
    `plan` set to premium the 26th row is saved and the limit reads 250.
- Browser check on the same build, headless Chrome for Testing through `playwright-core`, one
  test account. **22 of 22**:
  - Signed out, Watch market shows "Sign in to keep a watchlist. Sign in", the link is
    `/login?next=%2Fmarkets%2F<id>` and opens the login page, the button stays unpressed.
  - Signed in: Watch market becomes Watching and is still Watching after a reload. On a live
    scan of "meal prep", Track this seed becomes Tracking this seed and Save on one of 24 cards
    becomes Saved on that card only. The database then holds one market, one seed and one idea
    for the account.
  - `/watchlist` shows the three groups, the market name, the seed, the phrase and "3 of 25
    saved". Remove takes the idea row off and the count reads 2 of 25. Removing the market on
    its own page survives a reload; the database then holds only the seed.
  - No horizontal overflow at 375 px on `/`, the scan results and `/watchlist`, signed out and
    signed in. Header links do not overlap at 360, 375, 640, 768 and 1280 px (measured boxes).
    No console error on `/watchlist`.
- Cleanup: every test account, its rows and its usage rows deleted. Afterwards `watchlists` 0,
  `auth.users` 0, `public.users` 0, `usage_events` 0.

## Observations

- One unexplained result. The very first run of the live script, on a freshly started server,
  ended with one row too many: after the market and the idea were removed, two rows were left
  where one was expected. That run did not record the two responses, so it is not known which
  removal did not happen or what the server answered. With the responses recorded it did not
  happen again: five more full runs (one on a freshly started server) and 25 extra rounds of
  save-then-remove for a market and an idea, 100 writes, all clean. The Supabase management API
  returned two errors in the same minutes, so a failed request upstream is the likely cause, in
  which case the app answered 500 and the button kept its state. Not proven.
- The cap is read, then the row is inserted: two requests in the same instant can pass the cap
  by one. Same shortcut as the quota in `guard.ts`.
- A signed-out visitor who clicks Watch market and signs in comes back to the market page, but
  the click is not replayed: they click once more.
- A watched market is a row of one Deep run. A newer run of the same seed stores new market rows
  and the watchlist keeps pointing at the old one. 4.2 has to decide what "the same market in a
  newer run" means before it can report changes.
- A saved idea keeps the first seed it was saved from. Saving the same phrase from another
  seed's scan in the same region is the same row.
- Seen while applying the migration, not changed: the live migration list has no entry for
  `20260920000004_seed_tier2_sources.sql`. Whether its rows were applied another way was not
  checked.

## Review fix (PR #23 review, 2026-11-16)

- `GET /api/watchlist` removed. Nothing called it: the toggle sends POST and DELETE, and the
  pages read the list on the server with `listWatches`. Item 4 above and the "GET" lines of the
  live check describe the handler as it was when checked. A client or Part 4.2 that needs the
  list over HTTP adds it back.
- Verified: `pnpm test` 357 of 357, typecheck, eslint, `next build`. On the rebuilt production
  build, signed out: POST and DELETE still answer 401 and GET answers 405.

## Review checklist

- A. Acceptance: bookmark and unbookmark persist per user for all three kinds (live check and
  browser check above). Anonymous is asked to sign in; the decision is logged above and in the
  phase file. Files outside the "touches" list are listed above with the task that needs them.
- B. Evidence contract: no market, competition or trend claim added. The watchlist page shows a
  market's stored name and trend and no score. No third-party usernames, no secrets.
- C. Architecture: no source code outside adapters, no model call. The migration applied
  cleanly and `04-SCHEMA.md` describes the table.
- D. `pnpm lint`, `pnpm typecheck`, `pnpm build` green; `pnpm test` 357 of 357. 5.1 spot-check:
  the live script signs in through `/auth/confirm` and the plan change to premium is read by
  the next request. 6.12 spot-check: the header's four sections are unchanged from 640 px up.
