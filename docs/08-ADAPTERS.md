# 08 — SOURCE ADAPTER SPEC (PRD §10–§12)

## Why adapters (PRD §10, §62-final)

Free APIs change. Every source is an interchangeable module behind ONE interface. Adding or
losing a source never rewrites the engine.

## The interface (normative — implement exactly in Phase 1 Part 1.1)

```ts
// lib/sources/types.ts
interface SourceAdapter {
  key: string;                    // 'reddit' | 'gtrends' | 'web' | 'etsy' | ...
  displayName: string;
  tiers: 1 | 2 | 3;               // PRD §11 priority tier
  // Collect raw items for a query/window; return NORMALIZED signals (PRD §12).
  collect(input: { query: string; limit: number; since?: Date }): Promise<RawSignal[]>;
  normalize(raw: RawSignal): MarketSignal;   // maps to `signals` row shape
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
// Registry: lib/sources/registry.ts — adapter lookup by key, used by pipeline only.
```

`MarketSignal` (PRD §12) → `signals` row: source, source_id (external_id), url, title,
text (content), author (hashed/anonymous — NEVER store raw usernames in MVP), timestamp
(published_at), engagement {upvotes, comments, …}, market_candidates [], intent, pain_points [].

## Tier rollout (PRD §11)

- **Tier 1 (MVP):** Google Trends (momentum/seasonality/geo/related) + Reddit
  (pain/complaints/questions/requests/real language) + Google/Bing web search
  (competitors/products/articles/terminology).
- **Tier 2 (Phase 2 Part 2.3):** Etsy, Gumroad, Amazon KDP marketplace signals.
- **Tier 3 (post-MVP):** YouTube, Pinterest, TikTok, Product Hunt, Hacker News.
  TikTok integration/scraping explicitly OUT for MVP (PRD §50).

## Adapter rules

1. No source-specific imports outside `lib/sources/*`. Pipeline talks to the registry.
2. Authenticated/official access preferred; scraping ONLY where ToS allows, rate-limited,
   cached, and flagged in `DECISIONS.md` (triggers §4c review).
3. Every adapter has `healthCheck` + graceful degradation: dead source = run continues
   with fewer sources + completeness panel says so (PRD §55), never fake data.
4. Raw author identity is never stored; hash or drop (privacy by construction).
5. Google Trends is unofficial-API territory: isolate, cache aggressively (24h+), expect
   breakage — breakage follows the decision-request path, not a hack.
