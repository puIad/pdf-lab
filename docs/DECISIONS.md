# DECISIONS — decision-request log (problems stop here)

Append-only. Newest at the bottom. Every entry follows the template. Resolutions must also
patch the affected guide/phase file (link the follow-up commit).

## Template

```text
## DEC-XXX — <short title>
- Date:
- Part: Phase <N> Part <M>
- Expected: (what the docs said would happen)
- Found: (what actually happened — error text, version, link)
- Options: (a) ... (b) ... — with doc links + trade-offs
- Recommendation: (which option + why)
- Question for user: (the single sentence needing an answer)
- Resolution: (filled after answer + follow-up commit updating docs)
```

## DEC-001 — Jobs provider: Trigger.dev v4 vs Inngest vs cron (SEED — decide in Phase 4)

- Date: 2026-09-16
- Part: Phase 4 Part 4.2 (pre-seeded; do not decide earlier)
- Expected: MVP runs on route handlers + cron-pattern; scheduler choice deferred.
- Found: Pre-seed only. Trigger.dev verified v4 (`@trigger.dev/sdk` 4.x, durable tasks,
  cron, queues, idempotency keys — https://trigger.dev/docs). Inngest not re-verified
  (docs moved; check https://www.inngest.com/docs at decision time). Plain cron /
  Vercel Cron is the zero-dependency fallback.
- Options: (a) Trigger.dev v4 — durable, no timeouts, self-hostable (Apache-2.0 core);
  (b) Inngest — comparable, re-verify pricing/limits; (c) Vercel Cron + route handlers —
  simplest, platform timeout limits.
- Recommendation: none yet — measure Phase 1–3 run durations first; decide on data.
- Question for user: (to be asked in Phase 4) "Runs take ~X min and need Y retries — pick (a)/(b)/(c)?"
- Resolution: _unresolved_

## DEC-002 — Web-search provider pick (SEED — decide in Phase 1 Part 1.2)

- Date: 2026-09-16
- Part: Phase 1 Part 1.2 (pre-seeded)
- Expected: Exactly ONE free-tier search API behind the `web` adapter for MVP.
- Found: Candidates (Brave / Serper / Tavily / Bing) unverified — pricing changes fast.
- Options: compare free quota + ToS + snippet quality at build time; cheapest that returns
  URL+title+snippet+date wins for MVP.
- Recommendation: decide at Part 1.2 start with live pricing pages open.
- Question for user: (in Part 1.2) "Provider P free tier = X/mo — approve, or supply a key?"
- Resolution: _unresolved_
