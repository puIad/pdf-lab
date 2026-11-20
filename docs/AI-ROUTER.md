# AI MODEL ROUTER (PRD §32–§34)

## Provider interface (model-agnostic, PRD §32)

```text
AIProvider
 ├── OpenAI-compatible API
 ├── Amazon Bedrock (your experimentation path — keep working)
 ├── Gemini
 ├── local Ollama
 └── future providers (OpenRouter, ...)
```

Implementation: single `AIRouter` server-side module. App code calls
`router.generateObject / router.generateText / router.embed` — NEVER a provider SDK
directly. Provider selected per call by task tier + available keys. Adding a provider =
new file + registry line, zero caller changes.

## Task tiers (PRD §33) — cost control is architecture, not thrift

| Tier | Model class | Used for |
|---|---|---|
| Cheap | Small/fast/large-quota | classification, tagging, dedup, intent detection, simple extraction, clustering assist |
| Strong | Best reasoning available | synthesis, market reports, opportunity formulation, complex comparisons |
| Embed | Dedicated embedding model | semantic search, clustering, duplicate detection, similarity |

- `signal_analysis.embedding` dimension MUST equal the embed model's dim (`SCHEMA.md`).
  Changing embed models = migration + backfill plan, logged in DECISIONS.
- NVIDIA's default chat model is `nvidia/nemotron-3.5-bolt-e4b` (`NVIDIA_DEFAULT_CHAT_MODEL`); the
  earlier `openai/gpt-oss-20b` has been end of life since 2026-11-18 (HTTP 410, DEC-015). Override
  per tier with `NVIDIA_CHEAP_MODEL` / `NVIDIA_STRONG_MODEL`.
- Prompts are versioned in code; extraction outputs are validated objects (schema-checked),
  never free text parsed by regex.
- Extraction is batched (Part 6.9, `lib/ai/extraction.ts`): 10 signals per call by default
  (`EXTRACTION_BATCH_SIZE`, at most 25), one JSON item per signal keyed by its number, each item
  validated alone. A missing or invalid item is retried in a single call, as are the signals of a call
  that failed as a whole; single retries stop after 3 failures in a row, so an outage costs a few
  calls, not one per signal. About 100 signals take about 10 calls, which fits
  both known limits: NVIDIA 40 requests a minute (DEC-013) and OpenRouter's 50 free calls a day
  (DEC-012). `signal_analysis.prompt_version` records the prompt (`extract-v2-batch`).

## Extraction mode (Part 6.9, DEC-015)

The extraction mode is a setting (`/settings`, table `app_settings`), not an env var: one chat
model that answered a test, or pasted replies.

- `/settings` lists candidate chat models per configured provider (`candidateModels`). **Test**
  sends one 32-token chat call and shows whether it answered and in how long. A model that did not
  answer cannot be selected, and `POST /api/settings/extraction` runs the test again before saving.
- A model mode pins `providerName` + `model` on `generateText` / `generateObject`: that exact
  model, no fallback to another provider. `runExtractionJob` gets them from the saved mode.
- With a person's own keys (Part 5.2): a pinned model runs on its provider only. The person's key
  for that same provider (`byok-<provider>`) is tried first with the pinned model, then the hosted
  provider. Their keys for other providers are not used, because the owner chose this model.
- Pasted mode: `POST /api/research` (Deep) and `POST /api/runs` (Deep) answer 409 with
  `deepPath: "/deep"` and call no model. The Deep buttons already lead to `/deep`.
- No saved mode: unchanged, tier defaults and env models.
- Who may change it: the server key, a dev server, or the account whose email is `OWNER_EMAIL`.

## Hosting modes (PRD §34)

- **Mode 1 — Free:** free web sources + free AI quotas + local/open models + restricted depth.
  Default for dev and anon runs.
- **Mode 2 — BYOK:** user supplies Gemini / OpenAI-compatible / Bedrock / OpenRouter key;
  server routes that user's AI calls through their key (Phase 5). Keys encrypted at rest,
  never logged, never sent to client.
- **Mode 3 — Hosted premium:** project pays, higher limits (Phase 5).

### BYOK routing and the usage ledger (Part 5.2)

- `lib/keys/vault.ts` stores a person's Gemini, OpenAI-compatible, Bedrock or OpenRouter key
  (`PUT /api/keys`, rotate by saving again, `DELETE /api/keys?provider=`). Keys are AES-256-GCM
  encrypted with `KEY_VAULT_SECRET`, bound to the user and provider, never logged, never returned.
  `GET /api/keys` shows the last 4 characters and the status.
- `routerForUser(userId)` (`lib/keys/server.ts`) builds the router for one request: the person's
  active keys are registered as `byok-<provider>` and tried before every hosted provider, so Mode 2
  wins when a key is present; the hosted providers stay as the fallback. Gemini and Bedrock have no
  1536-dim embedding model here, so embeddings use an OpenAI-compatible or OpenRouter key, else hosted.
- Every result carries `keySource` (`byok` or `hosted`): the label of who paid. When a key is refused
  (HTTP 401/403) the call falls back to the hosted quota, the result carries `keyNotice` ("Your gemini
  key was refused ... the hosted quota answered instead"), and the key is marked `revoked`. A 429 or
  5xx from the person's own key also falls back, labelled `hosted`.
- Every successful call writes an `ai_usage_ledger` row (tokens, cost estimate, `key_source`, `run_id`).
  `GET /api/usage` totals the caller's month, or one run with `?run=<id>`, split by who paid. Part 5.3
  prices plans from these rows.
- Cross-checking a BYOK run against the provider's dashboard: take the run's `GET /api/usage?run=<id>`
  totals (`byKeySource.byok`) and compare the token sums with the usage page of the same key and
  window: Google AI Studio usage (Gemini), the OpenAI usage dashboard, OpenRouter Activity, or
  CloudWatch Bedrock invocation metrics. Provider-reported token counts are stored as received, so the
  two should agree to the call; a hosted-fallback call appears only in our ledger. The cost column is
  an estimate (`cost_basis`), the token counts are the figures to reconcile.
- Not built here (no UI yet): a key-entry form on `/account`. The endpoints above are the contract.
- Only the Deep run in one request, brief notes and the pipeline endpoints call the router with a
  person attached; a signed-in person's pasted Deep run (DEC-015) makes no router call, so it has no
  BYOK spend.

Cost-per-run is measured from Phase 1 (log tokens/calls per run) so Phase 5 pricing is
data-driven (PRD §49-final).
