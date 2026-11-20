// lib/ai/providers/gemini.ts — Google Gemini over REST (generateContent), key from the user (BYOK).
// Docs checked via Context7 (/websites/ai_google_dev_gemini-api): key in the x-goog-api-key header,
// system_instruction + contents, usageMetadata.{prompt,candidates,total}TokenCount.

import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from "../types.ts";
import { AIProviderNotConfiguredError } from "../types.ts";

export const GEMINI_KEY = "gemini";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

export interface GeminiConfig {
  apiKey?: string;
  name?: string;
  baseUrl?: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export class GeminiProvider implements AIProvider {
  readonly name: string;
  private readonly config: GeminiConfig;
  constructor(config: GeminiConfig) {
    this.config = config;
    this.name = config.name ?? GEMINI_KEY;
  }

  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private get base(): string {
    return this.config.baseUrl ?? GEMINI_BASE_URL;
  }

  async chatComplete(req: ChatRequest): Promise<ChatResponse> {
    if (!this.config.apiKey) throw new AIProviderNotConfiguredError("Gemini key is not set");
    const res = await this.config.fetchFn(`${this.base}/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": this.config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { temperature: req.temperature ?? 0, maxOutputTokens: req.maxTokens ?? 500 },
      }),
      signal: this.config.timeoutMs ? AbortSignal.timeout(this.config.timeoutMs) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini chat failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      modelVersion?: string;
    };
    const content = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!content.trim()) throw new Error("Gemini returned no content");
    const u = body.usageMetadata ?? {};
    const prompt = u.promptTokenCount ?? 0;
    const completion = u.candidatesTokenCount ?? 0;
    return {
      content,
      model: body.modelVersion || req.model,
      usage: { promptTokens: prompt, completionTokens: completion, totalTokens: u.totalTokenCount ?? prompt + completion, estimatedCostUsd: 0 },
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.config.apiKey) return { ok: false, detail: "Gemini key missing" };
    try {
      const res = await this.config.fetchFn(`${this.base}/models?pageSize=1`, { headers: { "x-goog-api-key": this.config.apiKey } });
      return res.ok ? { ok: true } : { ok: false, detail: `models endpoint HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
