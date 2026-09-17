// lib/ai/providers/ollama.ts — Ollama local provider (OpenAI-compatible).
// Per docs/07-AI-ROUTER.md + guides/ai-providers.md this is the FIRST cheap-tier
// choice for near-zero dev cost: free, offline, no key. Not installed in this
// environment (no localhost:11434 here) — the router falls through to the next
// configured provider and says so. Install: https://ollama.com/download,
// then `ollama pull <model>` and set OLLAMA_MODEL to match.

import type {
  AIProvider,
  CallUsage,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
} from "../types.ts";

export const OLLAMA_KEY = "ollama";
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
/** Generic dev default — override with OLLAMA_MODEL after `ollama pull`. */
export const OLLAMA_DEFAULT_MODEL = "llama3.1:8b";
const HEALTH_TIMEOUT_MS = 3000;

export interface OllamaConfig {
  baseUrl: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export function ollamaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OllamaConfig {
  return {
    baseUrl: env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL,
    fetchFn: fetch,
  };
}

function toUsage(raw: unknown): CallUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  // Ollama's OpenAI-compat endpoint returns OpenAI-shaped usage.
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens),
    estimatedCostUsd: 0, // local inference: always $0
  };
}

export class OllamaProvider implements AIProvider {
  readonly name = OLLAMA_KEY;
  /** Ollama needs no key — configured means "a base URL is set". */
  readonly isConfigured = true;
  private readonly config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  async chatComplete(req: ChatRequest): Promise<ChatResponse> {
    let res: Response;
    try {
      res = await this.config.fetchFn(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          temperature: req.temperature ?? 0,
          max_tokens: req.maxTokens ?? 500,
          stream: false,
        }),
      });
    } catch (err) {
      throw new Error(
        `Ollama unreachable at ${this.config.baseUrl} (is \`ollama serve\` running?): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama chat failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Ollama returned no assistant content");
    }
    return { content, model: body.model || req.model, usage: toUsage(body.usage) };
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const res = await this.config.fetchFn(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, detail: `tags endpoint HTTP ${res.status}` };
      return { ok: true, detail: `ollama reachable at ${this.config.baseUrl}` };
    } catch (err) {
      return {
        ok: false,
        detail: `no ollama at ${this.config.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
