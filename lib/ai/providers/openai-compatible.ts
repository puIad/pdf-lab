// lib/ai/providers/openai-compatible.ts — generic OpenAI-compatible fallback.
// Covers self-hosted gateways and any OpenAI-style endpoint via env:
// OPENAI_BASE_URL (default https://api.openai.com/v1), OPENAI_API_KEY,
// OPENAI_CHEAP_MODEL / OPENAI_STRONG_MODEL. No key → not configured → the
// router skips it (same honest-skip contract as SourceNotConfiguredError).

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

export interface OpenAICompatConfig {
  apiKey?: string;
  baseUrl: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
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
  readonly name = OPENAI_COMPAT_KEY;
  private readonly config: OpenAICompatConfig;

  constructor(config: OpenAICompatConfig) {
    this.config = config;
  }

  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private requireKey(): string {
    if (!this.config.apiKey) {
      throw new AIProviderNotConfiguredError(
        "OpenAI-compatible endpoint is not configured: set server-only OPENAI_API_KEY " +
          "(and OPENAI_BASE_URL for non-OpenAI gateways).",
      );
    }
    return this.config.apiKey;
  }

  async chatComplete(req: ChatRequest): Promise<ChatResponse> {
    const apiKey = this.requireKey();
    const res = await this.config.fetchFn(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        temperature: req.temperature ?? 0,
        max_tokens: req.maxTokens ?? 500,
      }),
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
    const res = await this.config.fetchFn(`${this.config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        input: req.texts,
      }),
    });
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
    if (!this.isConfigured) return { ok: false, detail: "OPENAI_API_KEY missing" };
    try {
      const res = await this.config.fetchFn(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) return { ok: false, detail: `models endpoint HTTP ${res.status}` };
      return { ok: true, detail: `openai-compatible reachable at ${this.config.baseUrl}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
