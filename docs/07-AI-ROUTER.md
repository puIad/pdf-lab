# 07 — AI MODEL ROUTER (PRD §32–§34)

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

- `signal_analysis.embedding` dimension MUST equal the embed model's dim (`04-SCHEMA.md`).
  Changing embed models = migration + backfill plan, logged in DECISIONS.
- Prompts are versioned in code; extraction outputs are validated objects (schema-checked),
  never free text parsed by regex.
- Extraction is batched (Part 6.9, `lib/ai/extraction.ts`): 10 signals per call by default
  (`EXTRACTION_BATCH_SIZE`, at most 25), one JSON item per signal keyed by its number, each item
  validated alone. A missing or invalid item is retried in a single call, as are the signals of a call
  that failed as a whole; single retries stop after 3 failures in a row, so an outage costs a few
  calls, not one per signal. About 100 signals take about 10 calls, which fits
  both known limits: NVIDIA 40 requests a minute (DEC-013) and OpenRouter's 50 free calls a day
  (DEC-012). `signal_analysis.prompt_version` records the prompt (`extract-v2-batch`).

## Hosting modes (PRD §34)

- **Mode 1 — Free:** free web sources + free AI quotas + local/open models + restricted depth.
  Default for dev and anon runs.
- **Mode 2 — BYOK:** user supplies Gemini / OpenAI-compatible / Bedrock / OpenRouter key;
  server routes that user's AI calls through their key (Phase 5). Keys encrypted at rest,
  never logged, never sent to client.
- **Mode 3 — Hosted premium:** project pays, higher limits (Phase 5).

Cost-per-run is measured from Phase 1 (log tokens/calls per run) so Phase 5 pricing is
data-driven (PRD §49-final).
