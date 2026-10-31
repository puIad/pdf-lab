// lib/ai/index.ts — AI layer entrypoint: router with all providers registered.
// Server code imports from here; it never imports a provider module directly
// (review gate C — same boundary rule as lib/sources/index.ts).

import { AIRouter } from "./router.ts";
import { OllamaProvider, ollamaConfigFromEnv } from "./providers/ollama.ts";
import { OpenRouterProvider, openRouterConfigFromEnv } from "./providers/openrouter.ts";
import {
  OpenAICompatProvider,
  nvidiaConfigFromEnv,
  openAICompatConfigFromEnv,
} from "./providers/openai-compatible.ts";

export function createRouter(env: NodeJS.ProcessEnv = process.env): AIRouter {
  const router = new AIRouter(env);
  // Registration order is NOT selection order — resolveTier() picks per
  // tier+availability. Adding a provider = import + one line here.
  router.register(new OllamaProvider(ollamaConfigFromEnv(env)));
  router.register(new OpenRouterProvider(openRouterConfigFromEnv(env)));
  router.register(new OpenAICompatProvider(openAICompatConfigFromEnv(env)));
  router.register(new OpenAICompatProvider(nvidiaConfigFromEnv(env)));
  return router;
}

let singleton: AIRouter | null = null;

/** Process-wide router (providers are stateless — safe to share). */
export function getRouter(): AIRouter {
  if (!singleton) singleton = createRouter();
  return singleton;
}

export { AIRouter } from "./router.ts";
export { extractJsonSlice } from "./router.ts";
export type { GenerateObjectResult, TierSelection } from "./router.ts";
export {
  EXTRACTION_PROMPT_VERSION,
  INTENT_VALUES,
  URGENCY_VALUES,
  buildExtractionUserText,
  runExtractionJob,
  validateExtraction,
} from "./extraction.ts";
export type {
  ExtractionFailure,
  ExtractionInput,
  ExtractionJobOptions,
  ExtractionJobSummary,
  ExtractionOutcome,
  ExtractionResult,
  ExtractionSuccess,
  IntentValue,
  UrgencyValue,
} from "./extraction.ts";
export type {
  AIProvider,
  CallUsage,
  ChatRequest,
  ChatResponse,
  CostLogEntry,
  CostLogSummary,
  ProviderHealth,
  TaskTier,
} from "./types.ts";
export { AIProviderNotConfiguredError, summarizeCostLog } from "./types.ts";
