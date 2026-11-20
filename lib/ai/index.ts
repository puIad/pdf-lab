// lib/ai/index.ts — AI layer entrypoint: router with all providers registered.
// Server code imports from here; it never imports a provider module directly
// (review gate C — same boundary rule as lib/sources/index.ts).

import { AIRouter, BYOK_PREFIX } from "./router.ts";
import type { AIRouterOptions } from "./router.ts";
import type { AIProvider } from "./types.ts";
import { GeminiProvider } from "./providers/gemini.ts";
import { BedrockProvider } from "./providers/bedrock.ts";
import { OllamaProvider, ollamaConfigFromEnv } from "./providers/ollama.ts";
import { OpenRouterProvider, openRouterConfigFromEnv } from "./providers/openrouter.ts";
import {
  OPENAI_COMPAT_DEFAULT_BASE_URL,
  OpenAICompatProvider,
  nvidiaConfigFromEnv,
  openAICompatConfigFromEnv,
} from "./providers/openai-compatible.ts";

/** A person's own key, decrypted for one request (Part 5.2). Structural, so lib/ai does not import lib/keys. */
export interface ByokKey {
  provider: "gemini" | "openai-compatible" | "bedrock" | "openrouter";
  apiKey: string;
  options: { baseUrl?: string; region?: string; model?: string };
}

function hostedProviders(env: NodeJS.ProcessEnv): AIProvider[] {
  return [
    new OllamaProvider(ollamaConfigFromEnv(env)),
    new OpenRouterProvider(openRouterConfigFromEnv(env)),
    new OpenAICompatProvider(openAICompatConfigFromEnv(env)),
    new OpenAICompatProvider(nvidiaConfigFromEnv(env)),
  ];
}

// The hosted providers are shared across requests: NVIDIA's request throttle lives in the instance.
let sharedHosted: AIProvider[] | null = null;

function registerByok(router: AIRouter, key: ByokKey): void {
  const name = `${BYOK_PREFIX}${key.provider}`;
  const fetchFn = fetch;
  const timeoutMs = 60_000;
  const model = key.options.model;
  switch (key.provider) {
    case "gemini":
      return router.registerByok(new GeminiProvider({ apiKey: key.apiKey, name, fetchFn, timeoutMs }), model);
    case "bedrock":
      return router.registerByok(new BedrockProvider({ apiKey: key.apiKey, region: key.options.region, name, fetchFn, timeoutMs }), model);
    case "openrouter":
      return router.registerByok(
        new OpenRouterProvider({ ...openRouterConfigFromEnv({} as NodeJS.ProcessEnv), apiKey: key.apiKey, name }),
        model,
      );
    case "openai-compatible":
      return router.registerByok(
        new OpenAICompatProvider({
          apiKey: key.apiKey,
          baseUrl: key.options.baseUrl || OPENAI_COMPAT_DEFAULT_BASE_URL,
          fetchFn,
          name,
          timeoutMs,
        }),
        model,
      );
  }
}

export function createRouter(
  env: NodeJS.ProcessEnv = process.env,
  opts: AIRouterOptions = {},
  byok: ByokKey[] = [],
): AIRouter {
  const router = new AIRouter(env, opts);
  // Registration order is NOT selection order — resolveTier() picks per
  // tier+availability. Adding a provider = import + one line in hostedProviders().
  let hosted: AIProvider[];
  if (env === process.env) {
    sharedHosted ??= hostedProviders(env);
    hosted = sharedHosted;
  } else {
    hosted = hostedProviders(env);
  }
  for (const p of hosted) router.register(p);
  // A person's own keys run first (Mode 2); the hosted providers stay as the fallback.
  for (const key of byok) registerByok(router, key);
  return router;
}

let singleton: AIRouter | null = null;

/** Process-wide hosted-only router (providers are stateless — safe to share). No ledger: use a user router for runs. */
export function getRouter(): AIRouter {
  if (!singleton) singleton = createRouter();
  return singleton;
}

export { AIRouter, BYOK_PREFIX } from "./router.ts";
export { extractJsonSlice } from "./router.ts";
export type { GenerateObjectResult, TierSelection } from "./router.ts";
export {
  EXTRACTION_PROMPT_VERSION,
  INTENT_VALUES,
  URGENCY_VALUES,
  buildExtractionUserText,
  runExtractionJob,
  validateBatchExtraction,
  DEFAULT_BATCH_SIZE,
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
export { AIProviderNotConfiguredError, isAuthFailure, summarizeCostLog } from "./types.ts";
export type { KeySource, MeteredCall } from "./types.ts";
