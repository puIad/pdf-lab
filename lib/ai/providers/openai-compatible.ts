// lib/ai/providers/openai-compatible.ts — generic OpenAI-compatible fallback.
// Covers self-hosted gateways and any OpenAI-style endpoint via env:
// OPENAI_BASE_URL (default https://api.openai.com/v1), OPENAI_API_KEY,
// OPENAI_CHEAP_MODEL / OPENAI_STRONG_MODEL. No key → not configured → the
// router skips it (same honest-skip contract as SourceNotConfiguredError).
// The same class serves NVIDIA's hosted API as provider `nvidia` (NVIDIA_API_KEY),
// with a request throttle for its per-key rate limit.

import type {
  AIProvider,
  CallUsage,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ProviderHealth,
} from "../types.ts";
import { AIProviderNotConfiguredError } from "../types.ts";

export const OPENAI_COMPAT_KEY = "openai-compatible";
export const OPENAI_COMPAT_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_DEFAULT_EMBED_MODEL = "text-embedding-3-small";

export const NVIDIA_KEY = "nvidia";
export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
/** Per-key limit the user's NVIDIA key reported (2026-10-24). Override with NVIDIA_RPM. */
export const NVIDIA_DEFAULT_RPM = 40;
/** Probe-picked 2026-10-24 (DEC-013). Override with NVIDIA_CHEAP_MODEL / NVIDIA_STRONG_MODEL. */
export const NVIDIA_DEFAULT_CHAT_MODEL = "openai/gpt-oss-20b";

export interface OpenAICompatConfig {
  apiKey?: string;
  baseUrl: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** Registry name; defaults to `openai-compatible`. */
  name?: string;
  /** Minimum gap between request starts (rate limit); 0 = none. */
  minIntervalMs?: number;
  /** Abort a request after this long; 0 = no timeout. */
  timeoutMs?: number;
  /** Sent as `reasoning_effort` (reasoning models such as gpt-oss); omitted when unset. */
  reasoningEffort?: string;
}

export function openAICompatConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OpenAICompatConfig {
  return {
    apiKey: env.OPENAI_API_KEY || undefined,
    baseUrl: env.OPENAI_BASE_URL || OPENAI_COMPAT_DEFAULT_BASE_URL,
    fetchFn: fetch,
  };
}

export function nvidiaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAICompatConfig {
  const rpm = Number(env.NVIDIA_RPM) || NVIDIA_DEFAULT_RPM;
  return {
    name: NVIDIA_KEY,
    apiKey: env.NVIDIA_API_KEY || undefined,
    baseUrl: env.NVIDIA_BASE_URL || NVIDIA_DEFAULT_BASE_URL,
    fetchFn: fetch,
    minIntervalMs: Math.ceil(60_000 / rpm),
    // Some hosted models queue for minutes; fail over to the next provider instead.
    timeoutMs: 60_000,
    // gpt-oss at default effort spent the whole 500-token extraction budget reasoning and returned
    // no content on 5 of 8 signals; "low" answered 3 of 3 of those in 4-7 s (2026-10-24).
    reasoningEffort: env.NVIDIA_REASONING_EFFORT || "low",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toUsage(raw: unknown): CallUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens),
    estimatedCostUsd: 0, // priced per account upstream; Phase 5 meters from tokens
  };
}

export class OpenAICompatProvider implements AIProvider {
  readonly name: string;
  private readonly config: OpenAICompatConfig;
  private nextSlotAt = 0;

  constructor(config: OpenAICompatConfig) {
    this.config = config;
    this.name = config.name ?? OPENAI_COMPAT_KEY;
  }

  /** Waits for the next request slot so calls stay under the rate limit. */
  private async slot(): Promise<void> {
    const gap = this.config.minIntervalMs ?? 0;
    if (gap <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = at + gap;
    if (at > now) await sleep(at - now);
  }

  /** POST with throttle + timeout; one retry on 429 after Retry-After (or 5 s). */
  private async post(path: string, apiKey: string, body: unknown): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      await this.slot();
      const res = await this.config.fetchFn(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.config.timeoutMs ? AbortSignal.timeout(this.config.timeoutMs) : undefined,
      });
      if (res.status !== 429 || attempt > 0) return res;
      await sleep((Number(res.headers.get("retry-after")) || 5) * 1000);
    }
  }

  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private requireKey(): string {
    if (!this.config.apiKey) {
      throw new AIProviderNotConfiguredError(
        `${this.name} endpoint is not configured: set server-only ${this.name === NVIDIA_KEY ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} ` +
          "(and OPENAI_BASE_URL for non-OpenAI gateways).",
      );
    }
    return this.config.apiKey;
  }

  async chatComplete(req: ChatRequest): Promise<ChatResponse> {
    const apiKey = this.requireKey();
    const res = await this.post("/chat/completions", apiKey, {
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? 0,
      max_tokens: req.maxTokens ?? 500,
      ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenAI-compatible chat failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
      );
    }
    const body = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("OpenAI-compatible endpoint returned no assistant content");
    }
    return { content, model: body.model || req.model, usage: toUsage(body.usage) };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const apiKey = this.requireKey();
    if (!req.texts || req.texts.length === 0) {
      return { embeddings: [], model: req.model, usage: toUsage({}) };
    }
    const res = await this.post("/embeddings", apiKey, { model: req.model, input: req.texts });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenAI-compatible embed failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
      );
    }
    const body = (await res.json()) as {
      model?: string;
      data?: Array<{ embedding: number[]; index?: number }>;
      usage?: unknown;
    };
    if (!body.data || !Array.isArray(body.data)) {
      throw new Error("OpenAI-compatible endpoint returned no embedding data array");
    }
    const sorted = [...body.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return {
      embeddings: sorted.map((d) => d.embedding),
      model: body.model || req.model,
      usage: toUsage(body.usage),
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) return { ok: false, detail: `${this.name === NVIDIA_KEY ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"} missing` };
    try {
      const res = await this.config.fetchFn(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) return { ok: false, detail: `models endpoint HTTP ${res.status}` };
      return { ok: true, detail: `${this.name} reachable at ${this.config.baseUrl}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
