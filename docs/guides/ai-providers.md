# GUIDE — AI providers + routing (PRD §32–§34; verify keys/quotas at build time)

Provider docs change fastest — resolve exact model IDs + free quotas in Phase 1 Part 1.3,
not now. This guide fixes the ARCHITECTURE so provider churn can't touch callers.

## Architecture (normative, implements 07-AI-ROUTER.md)

```text
app/lib code → AIRouter.generateObject/generateText/embed → provider file in lib/ai/providers/*
```

- No provider SDK imports outside `lib/ai/providers/*`. Registry maps
  task-tier → provider+model: cheap (extraction/classify/dedup/intent),
  strong (synthesis/reports/opportunities), embed (vectors; dim pinned in 04-SCHEMA.md).
- Extraction outputs are schema-validated objects; prompts versioned in code; every call
  logs tokens/calls/cost-estimate per run (Phase 5 ledger builds on this).

## Bring-up order (near-zero dev cost first)

1. Ollama local (free, offline) for cheap-tier dev + embed-tier if dim-stable.
2. One free-quota hosted provider (Gemini free tier historically; VERIFY current) for
   strong-tier dev.
3. OpenAI-compatible endpoint as the generic fallback interface.
4. Bedrock (your experimentation path): keep behind the same interface; creds server-only.
5. OpenRouter / others: registry additions only.

## BYOK (Phase 5 Part 5.2)

Per-user encrypted keys; router selects user's key when present; usage attributed per run.
Keys never logged/shipped to client. Exact crypto (Supabase Vault vs app-level) decided in
5.2 with a DEC entry.

## Drift triggers

Model deprecation/removal, embedding-dim change, free-tier removal, price shock →
decision request (§4a/§4c). Never silently swap models under stored embeddings.
