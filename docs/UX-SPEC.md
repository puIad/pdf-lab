# UX SPEC (PRD §7–§9, §19, §26–§28, §40–§48)

Scores shown are EVIDENCE-DERIVED (PRD §7 note). Any number without backing rows is a bug.
Frontend rule: build from the primitives in `components/ui` (DEC-016).

## Settings (Part 6.9)

`/settings`, owner only (linked from `/account`): the extraction mode. One row per candidate chat
model with a Test button (answered or not answering, seconds) and "Use this model", enabled only
after a passing test; a "Pasted replies" row. The mode in use is badged.

## Navigation and home (Part 6.12)

- One header on every page: Ideas (`/`), Markets (`/markets`), Research (`/research`), Radar
  (`/radar`), and Sign in or Account.
- `/` is the quick-ideas scan with the four steps to a brief, then the visitor's recent Deep
  runs. Deep research starts from a scanned seed ("Go deeper on this seed").
- The dashboard below is `/markets`. `/ideas` and `/?run=` redirect to `/` and `/markets?run=`.

## Dashboard (PRD §40, at `/markets` since Part 6.12)

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

**Niche trend note** (issue #71): when the run's Google Trends reading of the seed reaches no market
(the classifier files a signal under a market only if it names a problem), the markets list, each
market page and each opportunity's Why Now block show one labelled line: "Niche trend for <seed>:
average interest, direction, N readings. Seed-level context, not a market's trend." Read from the
run's own `run_signals` (`lib/trends/niche.ts`), never from a market. A market's trend label and
QC Rule 2 line still count only that market's own dated signals.

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
- Built in 4.1: `/watchlist` ("My watchlist") groups Markets, Tracked seeds and Saved ideas, each
  row with Remove, and shows the plan's cap. Rows are added with Watch market on a market report,
  Track this seed on a scan, and Save on an idea card. The header links to it on the right. A
  signed-out visitor is asked to sign in; nothing is kept in the browser.
- Export MVP: Markdown + CSV + JSON; PDF later; Notion/GDocs post-MVP (PRD §46).

## Quick ideas, verdict, brief (Parts 3.6 to 3.10, DEC-010)

- `/` (was `/ideas`): seed + region → idea cards (format, title, demand, PDF fit, trend, effort, interest,
  Timely / not-advice tags). Five ticks per card (demand, trend, PDF fit, effort, competition),
  each showing its threshold and count; competition stays blank until "Check competition" ran.
  Card actions: Validate, Deep research, Check competition, save, outline. Scan → CSV.
- Validate ends in GO / WAIT / KILL, with every rule listed beside the count that decided it.
- Brief (from an opportunity or a GO / WAIT idea): facts, AI interpretation and suggestions stay in
  separate, labelled layers (QC Rule 5); export Markdown / DOCX, Google Docs after 5.4.
- Never show a number without its basis. PDFMakerHub's random "live" metrics are the
  anti-example (`docs/research/2026-10-24-competitor-sweep.md`).
