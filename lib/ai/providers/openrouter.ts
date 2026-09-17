// lib/ai/providers/openrouter.ts — OpenRouter (OpenAI-compatible) provider.
// Verified live 2026-09-17: key auth + :free models return usage with cost 0.
// Default cheap model `nex-agi/nex-n2.5-pro:free` was probe-picked this part:
// exact-JSON extraction output + correct intent label in ~2.3s at $0.
// Override with OPENROUTER_CHEAP_MODEL. Free-model availability churns —
// breakage/retirement = decision request (§4a), never a silent swap.

import type {
  AIProvider,
  CallUsage,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
} from "../types.ts";
import { AIProviderNotConfiguredError } from "../types.ts";

export const OPENROUTER_KEY = "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Verified 2026-09-17 (see DEC-free probe in Part 1.3 notes). Env overrides. */
export const OPENROUTER_DEFAULT_CHEAP_MODEL = "nex-agi/nex-n2.5-pro:free";

export interface OpenRouterConfig {
  apiKey?: string;
  baseUrl: string;
  referer: string;
  title: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export function openRouterConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig {
  return {
    apiKey: env.OPENROUTER_API_KEY || undefined,
    baseUrl: env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL,
    referer: env.OPENROUTER_REFERER || "https://localhost/pdf-lab",
    title: env.OPENROUTER_TITLE || "pdf-lab",
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
    estimatedCostUsd: num(u.cost),
  };
}

export class OpenRouterProvider implements AIProvider {
  readonly name = OPENROUTER_KEY;
  private readonly config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private requireKey(): string {
    if (!this.config.apiKey) {
      throw new AIProviderNotConfiguredError(
        "OpenRouter is not configured: set server-only OPENROUTER_API_KEY " +
          "(free key at https://openrouter.ai, :free models cost $0).",
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
        "HTTP-Referer": this.config.referer,
        "X-Title": this.config.title,
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
      throw new Error(`OpenRouter chat failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("OpenRouter returned no assistant content");
    }
    return { content, model: body.model || req.model, usage: toUsage(body.usage) };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) return { ok: false, detail: "OPENROUTER_API_KEY missing" };
    try {
      const res = await this.config.fetchFn(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) return { ok: false, detail: `models endpoint HTTP ${res.status}` };
      return { ok: true, detail: "openrouter reachable, key accepted" };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
