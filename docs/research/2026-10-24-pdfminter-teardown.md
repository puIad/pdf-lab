# PDFMinter teardown (2026-10-24)

How pdfminter.com finds PDF ideas, what other idea generators do, and what PDF Lab should copy.
Evidence, not a plan: any build work goes through a phase part and `DECISIONS.md` (see DEC-008).
Follow-up the same day: `2026-10-24-competitor-sweep.md` (PDFMakerHub, PDFMinter's builder, other
tools); the scope questions this note left open are settled in DEC-010.

## Method and evidence

- Target: https://pdfminter.com (WordPress plugin `pdfminter` 1.0.21, "a product of LimeWorks
  Digital Inc.", GPLv2-or-later per its readme).
- Captured with Playwright (Obscura) as a signed-out visitor: homepage accessibility snapshot,
  network list, inline config. The REA MCP server timed out on connect, so the REA CLI
  (`analyze-javascript-application`) ran on the downloaded tree instead: Evidence
  `ev_a5cdf65fa50b3f16e32d924ae04981e48f8efdebaa858174a04723d185f5b231` (static only, nothing executed).
- Public files read in full (served unminified and commented under
  `/wp-content/plugins/pdfminter/assets/js/`), SHA-256 prefixes:
  `trends.js` 8885ed77, `outline.js` 9216666c, `core.js` c4f7b9cb, `admin.js` bc773545,
  `early.js` ee399c40; skimmed `render.js` eb570984, `builder.js` 4af5fd33, `app.js` d0c033ad.
  Plus `readme.txt` and the REST index at `/wp-json/`.
- Not observed: the PHP server that collects and scores. `GET /wp-json/pdfminter/v1/trends`
  returns 401 without a session, and no account was created. Everything the server computes is
  marked inferred or unknown below.

## Architecture

| Layer | What it is |
|---|---|
| Host | WordPress + Astra theme + Elementor, LiteSpeed cache. App mounted by shortcode `[pdfminter]`. |
| Client | Vanilla JS modules on `window.PDFM`: core (API, router), trends (Trend Lab), outline (auto-outline + templates), builder (drag-and-drop), render (paginator + export). Hash routes `#/trends`, `#/saved`, `#/pdfs`, `#/builder/<id>`. |
| API | `pdfminter/v1`: `trends?q&geo&refresh`, `trending-now?geo`, `ideas` (saved), `watch` (tracked topics), `projects` (+ `export`, `share`, `duplicate`), `uploads`, `me`, `admin/health`. Auth by WP cookie + `X-WP-Nonce`. |
| Collection | Server-side, keyless, cached 12 h by default, hourly search limit per user. Every source optional and fails soft; admin "Source Health" pings each one. |
| Export | html2canvas renders each page to JPEG, jsPDF assembles it ("Download PDF"); browser print for selectable text ("Print-quality PDF"). |

## The pipeline

### 1. Seed

1 to 3 word topic plus a region. 32 suggested seeds in 8 groups (Health, Money, Family, Career,
Home, Mind, Business, Life).

### 2. Collection (server, observed from readme + admin source list)

| Source | Role named in admin.js | Method |
|---|---|---|
| Google Autocomplete | core demand signal | question + modifier + A to Z expansion of the seed |
| YouTube Autocomplete | video / how-to demand | same expansion |
| Bing Autosuggest | second engine | same expansion |
| DuckDuckGo | third engine | same expansion |
| Amazon Suggest | buyer intent | same expansion |
| Google Trends | interest over time + rising queries | 12-month line, rising and breakout related queries |
| Google Trending Now | daily trending searches | feed shown on the home screen, refreshed hourly |
| Reddit | real questions and pain points | thread title, subreddit, score, comments, age |
| Wikipedia Pageviews | stable trend proxy | fallback trend line when Trends fails |

The readme calls the keyless sources "unofficial public endpoints" that can block shared hosts.
The expansion plan is a PHP filter (`pdfm_autocomplete_plan`), so the exact modifier list is not public.

### 3. Server output per phrase (observed field names, from the card code and CSV export)

`phrase, title, format, template, intent (howto | buyer | compare | ...), is_question,
demand 0-100, fit 0-100, opportunity 0-100, trend (breakout | rising | steady | declining),
trend_label (e.g. "+850%"), trend_basis, sources[], reddit_mentions, insight`.

`trend_basis` values show how a trend label was decided:

| basis | meaning (UI text) |
|---|---|
| `google_trends` | from Trends rising queries |
| `history` | how the phrase moved since the user's last scan |
| `new` | appeared since the last scan |
| `freshness` | mentions this or next year |
| `reddit` | several fresh Reddit threads mention it |
| `topic` | no spike or drop detected |

Topic level: `direction`, `change_pct`, `series` (Trends: last 4 weeks vs previous 12;
Wikipedia: last 28 days vs previous 56, weekly average over 4 months), `stats`
(ideas, avg_demand, rising, questions), per-source `{ok, count, error}`.

### 4. Badges computed in the browser (observed, `trends.js` `glance()`)

- Effort comes from the format only: Checklist and Cheat sheet are Easy; Planner, Worksheet and
  Guide are Medium; Ebook and Report are Hard.
- Interest is a band on demand: 65 or more High, 35 or more Medium, else Low. Low becomes Medium
  for breakouts and Trends-rising phrases.
- Competition is a specificity heuristic, not a measurement. Strip stopwords and the seed's own
  words from the phrase, count what is left ("core" tokens):
  - Low when the phrase is a question, has 3+ core tokens, or has 6+ words;
  - Medium when it has 2 core tokens;
  - otherwise High if interest is High, else Medium;
  - one step up when intent is buyer/compare and Amazon suggested it;
  - one step down for breakouts and Trends-rising phrases ("content hasn't caught up").
- The 5-point checklist the site teaches: Opportunity 60+, competition Low/Medium, trend
  Rising/Evergreen, effort Easy/Medium, demand 50+.

### 5. Auto-outline (observed, `outline.js` `suggest()`, no LLM)

1. Take the related phrases from the scan.
2. Rank each by `opportunity + 12 if it is a question + 45 × Jaccard(tokens, main phrase)`.
3. Walk the ranking, skip any phrase with Jaccard 0.6 or more against one already picked.
4. Turn phrases into headings: "how to ..." in Title Case, questions in sentence case with "?".
5. Pad with fixed per-format section lists (Guide 6, Checklist 4, Ebook 5, Worksheet 5, Report 4).
6. "Suggest different sections" rotates the ranking by 3.

Checklist items come from `actionize()`, a set of regex rewrites ("how to X" becomes "Learn how
to X", "best X" becomes "Choose the best X", "... mistakes" becomes "Avoid common ...").
The Report template inserts a real table of the top 10 phrases with demand and trend.

### 6. Monitoring

Tracked topics are re-scanned daily. Snapshots feed the `history` and `new` trend bases and a
"N new this week" badge.

## Observed, inferred, unknown

- Observed: everything in sections 4 to 6, the source list, field names, routes, auth gate.
- Inferred: the server Opportunity score uses demand, fit and trend only. The card tooltip says
  "Opportunity = demand + PDF fit + trend", and effort and competition are computed in the
  browser after the response arrives, so they cannot feed it. The FAQ's claim that it "mixes
  demand, trend, PDF fit, effort and competition" does not match the code.
- Inferred: demand is relative within one scan (readme: "not absolute monthly search volumes"),
  most likely from suggestion rank position and how many engines return the phrase. Not confirmed.
- Calibration points from the public example cards (demand, fit, trend → opportunity):
  (37, 50, Rising +850%) → 76; (90, 80, Evergreen) → 78; (70, 65, Evergreen) → 63.
  Three points are not enough to recover the weights.
- Unknown: the demand formula, the PDF-fit classifier (marketing says how-to/plans/lists score
  high, news/celebrities low), the format and title generator, the intent classifier, the
  `insight` text, and the breakout/rising/cooling thresholds. A signed-in `/trends` response or
  its CSV export for 3 to 5 seeds would settle most of these.

## Other generators (secondhand sources, marketing copy mostly)

| Family | Examples | Method | Data quality |
|---|---|---|---|
| Autocomplete miners | PDFMinter, AnswerThePublic, Keyword Tool | expand a seed through suggest endpoints, rank phrases | wide and cheap, relative demand only |
| Marketplace estimators | Publisher Rocket (KDP), Etsy research tools | competitor counts and sales estimates from listings | proprietary formulas, not public |
| LLM-only generators | Taskade, ClickUp, CreatorSense extension, prompt packs | prompt an LLM with niche + audience | no demand evidence |
| Static idea dumps | Gumroad CSV/PDF lists | pre-generated lists | none |

PDFMinter is the only one found that joins autocomplete mining, a trend source, a PDF-fit
filter and a builder in one flow.

## Mapping onto PDF Lab

| Capability | PDFMinter | PDF Lab today | Move |
|---|---|---|---|
| Long-tail phrase discovery | 5 autocomplete engines, A to Z + question expansion | none (Serper web search, Reddit, Trends, YouTube, site-filtered marketplace SERP) | new autocomplete adapter, source choice in DEC-008 |
| Trends rising/breakout | yes | `GTrendsAdapter` already calls `relatedQueries` | surface breakout/rising labels per phrase |
| Wikipedia pageviews | fallback trend line | none | new adapter on the official Wikimedia API, keyless, descriptive User-Agent |
| Trending-now feed | home screen | none | skip: PDFMinter's own guide says it is mostly news and celebrities |
| Phrase-level idea cards | core output | market clusters + 25 LLM opportunities | deterministic "quick ideas" layer for Hunt/Explorer: format, effort, interest, competition heuristic, trend label, source count |
| Cross-engine count as proof | source chips | evidence store with citations | feed engine count into confidence |
| Competition | text heuristic | observed marketplace listings (2.3) | keep PDF Lab's; use the heuristic only as a fallback when no listings were found |
| Auto-outline | Jaccard ranking over related searches | none | small, deterministic, works on evidence already stored |
| PDF builder + export | yes | out of scope until after MVP (02-MASTER-PLAN, PRD §50 "auto PDF generation") | needs a scope decision before any work |
| Tracked topics + "new this week" | daily re-scan | Phase 4.1/4.2 pending | adopt the snapshot-diff idea in 4.2 |

PDF Lab is already ahead on evidence: cited signals, QC rules 1 to 5, LLM extraction, clustering,
real marketplace competition. The parts worth taking are the cheap long-tail discovery, the
Wikipedia fallback, the per-phrase badges and the deterministic outline.

## Replication rules

- Reimplement the method; do not paste the plugin's code. It is GPL, and algorithms are not
  the part worth copying anyway.
- Every new source goes behind `SourceAdapter`, with `healthCheck`, caching and graceful
  degradation (08-ADAPTERS rules 1 to 3).
- Unofficial endpoints are a DECISIONS item before any code (08-ADAPTERS rule 2, DEC-007 precedent).

## Sources

- https://pdfminter.com/ , `/wp-content/plugins/pdfminter/readme.txt`, `/wp-json/` (fetched 2026-10-24)
- Publisher Rocket review: https://selfpublishing.com/?p=1020
- CreatorSense extension: https://chromewebstore.google.com/detail/dopihiaphgpkmmmdcdejpbifibmdbnjp
- Taskade product idea generator: https://www.taskade.com/generate/marketing/product-idea
- Serper autocomplete listing (third-party): https://apis.io/providers/serper/
- Wikimedia Analytics API: https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/getting-started.html
