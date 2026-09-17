# GUIDE — Tier-1 sources: Reddit, Google Trends, web search (verify at Phase 1)

PRD §11. All three sit behind `SourceAdapter` (08-ADAPTERS.md); pipeline never imports
source SDKs directly. ToS + quota realities rule every choice below.

## Reddit (Part 1.1)

- Prefer AUTHENTICATED access (OAuth script app, read-only) over anonymous scraping:
  higher limits, stable contract, ToS-clean.
- Adapter: subreddit/keyword search → posts (+ top comments where quota allows) →
  normalized signals; authors HASHED or dropped (never raw usernames — 04-SCHEMA + 06).
- Respect rate limits with backoff + caching; `healthCheck` reports quota state.
- Verify at build: current OAuth flow + rate limits in official Reddit API docs
  (https://www.reddit.com/dev/api — re-check, do not trust memorized endpoints).

## Google Trends (Part 1.2)

- ⚠️ No official public API — community/unofficial clients break regularly. ISOLATE the
  adapter, CACHE ≥24h, DEGRADE gracefully (run continues, completeness panel says so).
- Use for: momentum, seasonality, geo, related queries (PRD §11) across 7d/30d/90d+12m
  windows (PRD §22). Breakage → decision request, never a scraper hack without §4c review.

## Web search (Part 1.2, DEC-002 — RESOLVED 2026-09-17: Serper)

- Pick exactly ONE free-tier provider for MVP: Brave / Serper / Tavily / Bing.
  Decide on LIVE pricing + snippet quality (need URL+title+snippet+date) at Part 1.2 start;
  log in DEC-002.
- DEC-002 outcome: **Serper** (`SERPER_API_KEY`, `POST https://google.serper.dev/search`).
  2,500 free credits, no credit card, ~$1/1K → ~$0.30/1K; raw Google SERP JSON matches
  the adapter shape directly. Brave (card + attribution, ~1,000/mo credit), Tavily
  ($8/1K — extraction is a Phase-2 concern), and Bing (API retired summer 2025) lost.
  Until a key lands, `WebAdapter` reports `skipped` honestly — no filler.
- Use for: competitor discovery, products, articles, discussions, terminology (PRD §11).

## Tier-2/3 (later)

- Etsy/Gumroad/KDP (Part 2.3): official/API or ToS-clean endpoints first; web-backed
  extraction only after §4c review per source, logged in DECISIONS.
- YouTube/Pinterest/TikTok/Product Hunt/HN (post-MVP): TikTok scraping explicitly OUT
  for MVP (PRD §50).
