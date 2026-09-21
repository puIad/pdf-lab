# 09 — UX SPEC (PRD §7–§9, §19, §26–§28, §40–§48)

Scores shown are EVIDENCE-DERIVED (PRD §7 note). Any number without backing rows is a bug.
Frontend rule: ALWAYS and ONLY use components, UI primitives, and directing prompts from
`C:\Users\pulad\Desktop\frontend-ai-megalibrary`.

## Dashboard (PRD §40)

```text
PDF LAB
[ Search a market...                    ]
🔥 Trending Markets   📈 Fastest Growing   💰 High Buyer Intent   🧩 Recently Discovered
[ Run Deep Research ]
```

Sections render from `markets` + evidence counts; empty states say "no markets observed yet".

## Market Explorer table (PRD §7)

Columns: Market | Demand | Trend | Competition | Opportunity (+ confidence on hover/click).
Rows link to market pages. Filters (Phase 3): trend, intent, competition, PDF-fit.

## Market page (PRD §41–§42)

Header + bars (Trend/Demand/Buyer-intent/Competition/PDF-fit, each with confidence) →
WHY THIS MARKET (observed problems) → BUYER LANGUAGE (verbatim, sourced) → COMPETITORS →
PRODUCT GAPS → OPPORTUNITIES → EVIDENCE explorer per cluster (Reddit N discussions,
Trends delta %, Web N pages, Marketplace N products; every item links to its source).

## Opportunity detail (PRD §47) — also the product spec

Title, customer, problem, desired outcome, why-now, evidence, market signals, trend,
competition, product gap, recommended PDF format, table of contents, bonuses,
positioning, search keywords, customer language, evidence sources.

## Research UX (PRD §26–§29)

- NL queries ("PDF markets for busy parents", "high intent + low competition",
  "problems asking for templates") → structured research query.
- Modes: Explore / Validate / Hunt / Deep Research / Monitor (PRD §27).
- Signature command flow preserved as UI + API: `pdf-lab <niche>` → 25 opportunities →
  web research → buyer signals → trends → competition → gaps → final report (PRD §28).
- Exactly 25 DISTINCT opportunities per deep run — diversified across audiences, problems,
  formats, urgency, price, sophistication, mechanism, outcome (PRD §29). Variations of one
  product fail acceptance.

## Watchlist / monitoring / alerts / export (PRD §43–§46)

- Watchlist (Phase 4.1) → scheduled re-research + change reports (4.2) → in-app alerts
  first, email/browser optional (4.3).
- Export MVP: Markdown + CSV + JSON; PDF later; Notion/GDocs post-MVP (PRD §46).
