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

## Hosting modes (PRD §34)

- **Mode 1 — Free:** free web sources + free AI quotas + local/open models + restricted depth.
  Default for dev and anon runs.
- **Mode 2 — BYOK:** user supplies Gemini / OpenAI-compatible / Bedrock / OpenRouter key;
  server routes that user's AI calls through their key (Phase 5). Keys encrypted at rest,
  never logged, never sent to client.
- **Mode 3 — Hosted premium:** project pays, higher limits (Phase 5).

Cost-per-run is measured from Phase 1 (log tokens/calls per run) so Phase 5 pricing is
data-driven (PRD §49-final).
