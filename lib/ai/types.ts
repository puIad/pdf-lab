// lib/ai/types.ts — model-agnostic AI contracts (Phase 1 Part 1.3).
// Normative spec: docs/07-AI-ROUTER.md. App code calls AIRouter — NEVER a
// provider SDK or fetch directly (review gate C). Adding a provider = new
// file in lib/ai/providers/* + one registry line, zero caller changes.

/** Task tier per docs/07-AI-ROUTER.md (cost control is architecture). */
export type TaskTier = "cheap" | "strong" | "embed";

/** Token/cost usage for one provider call. Free-tier calls report 0 cost. */
export interface CallUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD estimate when the provider reports pricing, else 0. Never null. */
  estimatedCostUsd: number;
}

export function emptyUsage(): CallUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

export function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
  };
}

/** One chat completion behind the provider boundary. */
export interface ChatRequest {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  /** Raw assistant text (may include markdown fences — router strips them). */
  content: string;
  /** Model id as reported by the provider (may differ from request). */
  model: string;
  usage: CallUsage;
}

/** Result of `AIProvider.healthCheck`. Never throws — failure is `{ ok: false }`. */
export interface ProviderHealth {
  ok: boolean;
  detail?: string;
}

/**
 * Provider contract. Implementations live ONLY in lib/ai/providers/* and
 * take fetchFn/nowFn via config so unit tests run with zero network.
 */
export interface AIProvider {
  /** Registry key: 'ollama' | 'openrouter' | 'openai-compatible' | ... */
  readonly name: string;
  /** True when required credentials/config are present (no network call). */
  readonly isConfigured: boolean;
  chatComplete(req: ChatRequest): Promise<ChatResponse>;
  healthCheck(): Promise<ProviderHealth>;
}

/**
 * Thrown by `chatComplete` when the provider has no credentials/config.
 * Mirrors SourceNotConfiguredError: the router treats it as "try the next
 * configured provider" instead of a hard failure.
 */
export class AIProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderNotConfiguredError";
  }
}

/** One row of the per-run token/call cost log (feeds Phase 5 pricing). */
export interface CostLogEntry {
  at: string;
  provider: string;
  model: string;
  tier: TaskTier;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface CostLogSummary {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  providers: string[];
  models: string[];
}

export function summarizeCostLog(entries: CostLogEntry[]): CostLogSummary {
  return {
    calls: entries.length,
    promptTokens: entries.reduce((n, e) => n + e.promptTokens, 0),
    completionTokens: entries.reduce((n, e) => n + e.completionTokens, 0),
    totalTokens: entries.reduce((n, e) => n + e.totalTokens, 0),
    estimatedCostUsd: entries.reduce((n, e) => n + e.estimatedCostUsd, 0),
    providers: [...new Set(entries.map((e) => e.provider))],
    models: [...new Set(entries.map((e) => e.model))],
  };
}
