# Competitor sweep: PDFMakerHub, PDFMinter's builder, other idea tools (2026-10-24)

Follow-up to `2026-10-24-pdfminter-teardown.md` (same day). That note covers PDFMinter's discovery
pipeline; this one adds PDFMakerHub, PDFMinter's builder and export, the signed-in attempt, and
the wider tool landscape. Decisions taken from it: DEC-010. Work items: Phase 3 Parts 3.7 to 3.11,
rescoped 4.1 to 4.3, new 5.4.

## Method and evidence

- PDFMakerHub (https://pdfmakerhub.com): Playwright (Obscura) signed-out visit, accessibility
  snapshot, network list. The page loads two first-party scripts and AdSense, nothing else: no API,
  no accounts. Both scripts read in full, SHA-256 prefixes `ideas.js` 0f14d742, `app.js` a966a8f6.
- PDFMinter: plugin still 1.0.21 (script tags checked); `builder.js` 4af5fd33, `render.js`
  eb570984 and `trends.js` 8885ed77 hash the same as in the morning teardown. This pass read the
  builder palette, block factory, theme panel, export and share code in `builder.js`, plus
  `readme.txt` (7f544ae5) in full.
- Signed-in attempt: Cloudflare Turnstile on PDFMinter's WordPress sign-up page failed in the Claude
  desktop app's built-in browser and in a Playwright-launched Edge window. Not worked around. The
  user will run the scans from their own browser (snippet in `pdfminter-exports/README.md`).
- Other tools: one round of web search. Sources are vendor pages and affiliate reviews; every claim
  about them is the vendor's or reviewer's, not tested here.

## PDFMakerHub

A static idea catalog with simulated metrics. The data file says so in its header: "200+ PDF
guide ideas across 20 niches with simulated real-time market data".

| Part | Observed |
|---|---|
| Catalog | 202 hand-written ideas in 21 categories (the page hard-codes "20 Niches Tracked"). Fields: `title, category, description, audience, volume, competition, trend, monetize, angles[]`. |
| Labels | `volume`, `competition`, `monetize` are hand-set Low to Very High; `trend` is Hot / Rising / Evergreen. One entry has `volume: "Rising"`, a data error. |
| "Live" numbers | Ticker change = `12 + random(480)`% per page load; rising-list momentum = `30 + random(380)`%; "Top monetization" = `$800 + random(4000)/mo`. "Updated daily" prints the visitor's own date. The same phrase shows different percentages within one ticker loop. |
| Charts | "Hottest niches" = sum of trendRank x volumeRank over the hand labels per category, scaled to 100. Trend donut = label counts. |
| Idea modal | Description, the four labels, 4 to 5 "content angles" (add-on pieces such as trackers, meal plans, checklists), and the same fixed "Where to sell" list for every idea (Etsy, Gumroad / Lemon Squeezy, Stan Store / Beacons, Amazon KDP). |
| Other | "Random" idea button; weekly "Trending Ideas brief" form that only calls `console.log` (`// TODO: wire to your email provider`); SEO articles; AdSense slots every 8 cards. |

Worth taking: the niche taxonomy as browse entry points, and the idea shape (one audience, one
promise, a few add-on angles). Nothing numeric. It is also the clearest example of what PDF Lab
must not do: numbers with nothing behind them.

## PDFMinter: builder, export and account (adds to the teardown)

- Plans: free account with 5 PDF downloads a month (homepage FAQ). The builder handles a server
  `pdfm_quota` error as "Monthly limit reached". Admin settings add an hourly search limit.
- Builder palette, 13 blocks: heading, text, bullet list, checklist, image, callout, quote, table
  (up to 6 columns), write-in lines (1 to 20), contents, divider, page break, cover page (default
  badge "Free Guide").
- Theme: A4 or US Letter; 10 brand colours, 8 accents and a custom picker; 6 self-hosted font
  pairings (OFL fonts); 4 cover styles; logo on the cover and in footers; margins, heading style,
  page numbers, footer text.
- Editing: autosave, undo/redo, preview, duplicate, heading navigator.
- Export: "Download PDF" (html2canvas page images assembled by jsPDF) or "Print-quality PDF"
  (browser print, selectable text). Share: a public link on pdfminter.com with "Update with latest
  edits" and "Stop sharing".
- Accounts: WordPress sign-up with email confirmation and Turnstile; CASL email-consent records; a
  Brevo CSV export of members who opted in.
- Guidance content: the 5-point checklist (from the teardown), and "what makes a guide people pay
  for": one problem and one promise, say who it is for, add tools (checklists, plans, trackers) not
  just text, be clear and honest, with a "not professional advice" note for health, money and legal
  topics.
- Still unknown, server side: the demand formula, PDF-fit classifier, format and title generator,
  intent classifier, `insight` text and trend thresholds. The user's scan file will settle most of
  these (Part 3.11).

## Other tools

| Tool | What it does (per source) | Take for PDF Lab |
|---|---|---|
| EverBee (Etsy) | Chrome extension: trending listings, keywords, sales estimates extrapolated from public listing signals; free Hobby plan. Reviewers say estimates overstate small listings. | Listing and review counts; no revenue estimates |
| eRank (Etsy) | Keyword and tag research, listing counts; from about $5.50 to $5.99 a month, free tier. | Listing counts per phrase as observed competition |
| Alura (Etsy) | All-in-one shop suite; estimates draw the most complaints. | Nothing new |
| Aurify (Apify actor), Selar "Will It Sell?", LicenseLand | Idea validators: a 0-100 or 1-10 demand score and a GO / WAIT / KILL or traffic-light verdict; methods unpublished. | A verdict, with its rules and counts shown |
| Designrr, Beacon.by, Simplified, Venngage | Turn existing content (URL, doc, blog) into an ebook or lead magnet; PDF, ePub, Kindle, flipbooks, lead-capture forms. | Nothing: outside PDF Lab's boundary |
| Inkfluence AI, Pillar.io, GodOfPrompt | LLM outline generators from a topic or title. | LLM section notes only, grounded in stored evidence |
| eBook Business Builder (Product Hunt) | Strategy through writing, cover, PDF and launch marketing assets. | Listing copy only |

## Where PDF Lab stands

PDF Lab is ahead on evidence (cited signals, QC Rules 1 to 5, clustering, observed marketplace
competition, 25-opportunity Deep runs). It is behind on the last mile: nothing turns a good idea
into something a creator can start writing or listing. DEC-010 closes that gap with a build-ready
brief instead of a builder, and connects the quick-ideas layer to the deeper pipeline.

## Sources

- https://pdfmakerhub.com/ , `/ideas.js`, `/app.js` (fetched 2026-10-24)
- https://pdfminter.com/ , `/wp-content/plugins/pdfminter/assets/js/builder.js`, `/wp-content/plugins/pdfminter/readme.txt` (fetched 2026-10-24)
- EverBee, eRank, Alura reviews: https://revenuegeeks.com/software/everbee , https://revenuegeeks.com/software/alura , https://ojdigitalsolutions.com/best-etsy-seo-tools/ , https://sellertoolshq.com/tools/compare/best-etsy-seo-tools/
- Validators: https://apify.com/orexia/aurify , https://selar.com/6jam8a7190 , https://www.licenseland.it.com/
- Content-to-ebook: https://designrr.io/designrr-vs-beacon/ , https://www.stork.ai/en/venngage-ai-lead-magnet-generator
- Outline generators: https://www.inkfluenceai.com/ebook-outline-pdf , https://pillarcreators.notion.site/AI-powered-Building-the-e-book-that-will-make-you-money-10311c7c678180f78ac2fa1054b86be5 , https://www.godofprompt.ai/chatgpt-free/develop-e-books-for-sale
- eBook Business Builder: https://www.producthunt.com/posts/1219533
