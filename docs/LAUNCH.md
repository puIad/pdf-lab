# Launch checklist and handoff (Part 6.3)

Status: **draft, not signed.** DEC-017 (source terms) and the owner's sign-off are open, so
`mvp-v1` is not tagged. Everything an agent can prove is below with how it was proved; every line
that needs the owner says so.

## 1. Costs

Inputs live in `lib/launch/cost-model.ts`; `lib/launch/cost-model.test.ts` checks the sums and that
the marketplace adapters make one search call per collect. **Nothing here is a billed run.** The
usage ledger (Part 5.2, PR #64) was not merged when this was written, so AI cost is token counts
times list prices, and search cost is call counts times Serper's list price (about $1 per 1,000
calls, $0.30 at volume; 2,500 free credits once, DEC-002).

Calls per action (search = Serper):

| Action | Serper calls | Hosted AI | Where the count comes from |
|---|---|---|---|
| Stored-data search | 0 | none | no adapter runs |
| Idea scan (exploration) | 1 | none | web phrases; Trends and Wikipedia make no Serper call |
| Competition check | 3 | under $0.001 | Etsy, Gumroad, KDP; 89 calls for 5 scans and 28 checks in the calibration run |
| Deep run, about 100 signals | 4 | about $0.01 | web plus the three marketplaces; 10 extraction batches, about 8 naming calls, 1 opportunity call |

Dollars per action, paid by the project:

| Action | Free | BYOK | Premium |
|---|---|---|---|
| Idea scan | $0.001 | $0.001 | $0.001 |
| Competition check | $0.003 | $0.003 | $0.003 |
| Deep run | $0.004 | $0.004 (key pays about $0.01 more) | $0.014 |

Free uses free-tier models ($0 AI). BYOK bills the person's own key for AI, the project still pays
search. Premium means the project pays a hosted paid model (DEC-012 price, $0.075 per million
input tokens and $0.25 per million output; the premium model is not chosen, Part 5.3). A Deep run
pasted through `/deep` (DEC-015) costs the project no AI at all.

A person who uses every counted action up to the limits in `lib/quotas/quotas.ts` costs the project
$0.069 a month on free and $1.58 on premium.

Monthly projection for the project (5 % of active people premium):

| Signed-up users | Ceiling: all active, every limit used | Expected: 30 % active, 40 % of limits |
|---|---|---|
| 100 | $14.46 | $1.73 |
| 1,000 | $144.55 | $17.35 |
| 10,000 | $1,445.50 | $173.46 |

The ceiling is dominated by premium competition checks (400 a month at 3 calls). The expected
column is a guess for a launch month; replace it with the active-user count on `/admin/metrics`.
Not in the table: Supabase and Vercel plans, the NVIDIA and OpenRouter free pools running out
(DEC-012, DEC-013), and a premium model's price once chosen.

## 2. Abuse and legal

### Rate limits (what exists)

- Per person: counted quotas by plan (`lib/quotas`), checked and recorded in one locked SQL step
  (`take_usage`), so two requests cannot both pass the limit. Signed-out callers are counted by an
  HMAC of their IP (the address is never stored): 3 searches a day, nothing else.
- Pipeline endpoints (`/api/ingest`, `/api/extract`, `/api/cluster`, `/api/runs`,
  `/api/opportunities/generate`) accept only the server key or a dev server.
- Watchlist rows are capped per plan (`add_watch`); a metric vote is one row per person and opportunity.
- Per source: a minimum interval between calls (Reddit 2 s, Google Trends 5 s, Serper-backed 1 s,
  YouTube 1 s) and caches (Trends 24 h, Wikipedia 24 h). NVIDIA is held to 40 requests a minute.
- Read-only endpoints without a guard (`/api/health`, `/api/radar`, `/api/topics/solvable`,
  `/api/trends/*`, `/api/export`) read stored rows and call no source or model.
- Not present: a per-IP request throttle in front of the app (Vercel's firewall is the place for it).

### Terms of service per source

| Source | Access | Finding |
|---|---|---|
| Reddit | OAuth Data API, read only | **Open, DEC-017.** Reddit requires approval before any access and written approval for commercial use (a paid plan is commercial), forbids keeping data beyond the approved use case, and forbids using content for model training. No production app id exists (#44). |
| YouTube comments | Official Data API key | **Open, DEC-017.** Stored API data other than statistics must be refreshed or deleted after 30 days. PDF Lab keeps signals indefinitely and has no purge. |
| Google Trends | Unofficial community client, no key | Google offers no Trends API and its terms do not grant automated access. Isolated in one module, throttled, cached 24 h, breakage follows the decision path (ADAPTERS rule 5). Risk accepted in the plan since Part 1.1; owner to re-confirm. |
| Web search | Serper (licensed vendor, DEC-002) | Vendor carries the Google side. PDF Lab stores title, URL, snippet and date, and links back. |
| Etsy, Gumroad, Amazon KDP | Serper `site:` searches (DEC-007) | PDF Lab never requests a marketplace page itself, so no marketplace terms are exercised directly; the data is what Google shows in results (title, price, rating counts, link). Revisit if a marketplace objects. |
| Wikipedia | Official keyless APIs with a contact User-Agent | Only page-view counts are stored. Fine. |
| Autocomplete | Unofficial suggest endpoints | Off in production by code (`PDFLAB_UNOFFICIAL_AUTOCOMPLETE` is ignored on Vercel, DEC-008). |
| TikTok | none | Out per PRD §50. No adapter exists in `lib/sources`. |

### Privacy

- **Authors are not stored.** The `signals` table has no author column and nothing in `lib/ingest`
  writes one. Adapters also hash an author before the signal leaves them (`sha256` with a salt that is
  not a secret), so a hashed name is never a safeguard on its own, only a second layer.
- Signed-out use is counted by an HMAC of the IP; the address is not kept.
- API keys are server-only; the BYOK vault (PR #64) encrypts per user.
- **Export and deletion of your own data:** `/account` has a download button and a delete box.
  `GET /api/account` returns the person's rows as JSON; `DELETE /api/account` with
  `{"confirm":"delete my account"}` deletes the sign-in, and the database trigger and cascades remove
  the profile, usage events, watchlist, metric events and research runs (SCHEMA.md, Sign-in and usage).
  Any table PR #64 adds with a `user_id` must also cascade; its migration is the place to check.
- **Takedown of third-party content** (a seller, author or platform asks PDF Lab to remove a
  stored item). Owner runbook, run in the Supabase SQL editor with the item's URL:

  ```sql
  delete from evidence    where url = :url;   -- no foreign key, so removed explicitly
  delete from competitors where url = :url;
  delete from signals     where url = :url;   -- cascades to signal_analysis, market_signals, run_signals
  ```

  Then answer the requester. Gap: nothing stops the next scan from collecting the item again; a
  blocklist is part of the DEC-017 follow-up.

## 3. Roadmap handoff (PRD §57)

The PRD text is not in the repo, so the stages follow the names in this issue and `docs/README.md`
(out of scope until after the MVP).

| Stage | Contents | Where it is tracked |
|---|---|---|
| V1 discovery | Deep runs, markets, opportunities, evidence, quotas, metrics | this release |
| V1.5 marketplace | Direct marketplace data beyond Serper results; needs terms review per marketplace | not yet an issue; file after DEC-017 |
| V2 monitoring | Scheduled re-research, change detection, seed re-scans | #26 (Part 4.2) |
| V2.5 alerts | In-app alerts and weekly digest, then email | #27 (Part 4.3) |
| V3 creation assistant | Brief to PDF drafting; Google Docs export first | #30 (Part 5.4); drafting not yet an issue |

## 4. Decisions

All DEC-001 to DEC-016 are resolved except DEC-013, which describes work that shipped (NVIDIA
provider, throttle) and whose open model question became DEC-015; its remaining production step
(`NVIDIA_API_KEY` in Vercel) is an environment setting. **New and open: DEC-017**, source terms.

Open issues that wait on the owner and block nothing in code: #33, #43 (calibration file), #38
(Supabase redirect list), #44 (Reddit app id), #45 (Vercel auto-deploys), #54 (review action).

## 5. Launch gate

| Gate line | State | Evidence |
|---|---|---|
| QC rules enforced in code | enforced | `lib/evidence` (rules 1 to 5), `orchestrator.ts` rule 3; tests in `lib/evidence/evidence.test.ts` and `lib/runs/orchestrator.test.ts` |
| Confidence shown | shown | confidence and counts on opportunities and the quality panel (`components/quality-panel`) |
| Metrics events firing | firing in code; not against a live database | `lib/analytics` tests; migration 14 applied status unknown |
| Cost per run measured and documented | documented, **estimated** | section 1; replace with ledger totals once Part 5.2 is merged and has rows |
| Terms of service reviewed | reviewed, **two sources fail** | section 2, DEC-017 |

## 6. Sign-off

Signed means the owner has read sections 1 to 5 and answered DEC-017. An agent does not sign this.

- Owner: ______________________  Date: ____________
- Tag after the merge on master: `git tag mvp-v1 && git push origin mvp-v1`
