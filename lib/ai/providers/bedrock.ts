// lib/ai/providers/bedrock.ts — Amazon Bedrock Converse over REST with a Bedrock API key (BYOK).
// Docs checked via Context7 (/websites/aws_amazon_bedrock, "api-keys-use"): POST
// https://bedrock-runtime.<region>.amazonaws.com/model/<modelId>/converse, Authorization: Bearer <key>.

import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from "../types.ts";
import { AIProviderNotConfiguredError } from "../types.ts";

export const BEDROCK_KEY = "bedrock";
export const BEDROCK_DEFAULT_REGION = "us-east-1";

export interface BedrockConfig {
  apiKey?: string;
  region?: string;
  name?: string;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export class BedrockProvider implements AIProvider {
  readonly name: string;
  private readonly config: BedrockConfig;
  constructor(config: BedrockConfig) {
    this.config = config;
    this.name = config.name ?? BEDROCK_KEY;
  }

  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private get host(): string {
    return `https://bedrock-runtime.${this.config.region || BEDROCK_DEFAULT_REGION}.amazonaws.com`;
  }

  async chatComplete(req: ChatRequest): Promise<ChatResponse> {
    if (!this.config.apiKey) throw new AIProviderNotConfiguredError("Bedrock key is not set");
    const res = await this.config.fetchFn(`${this.host}/model/${encodeURIComponent(req.model)}/converse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        system: [{ text: req.system }],
        messages: [{ role: "user", content: [{ text: req.user }] }],
        inferenceConfig: { maxTokens: req.maxTokens ?? 500, temperature: req.temperature ?? 0 },
      }),
      signal: this.config.timeoutMs ? AbortSignal.timeout(this.config.timeoutMs) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bedrock chat failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    };
    const content = (body.output?.message?.content ?? []).map((c) => c.text ?? "").join("");
    if (!content.trim()) throw new Error("Bedrock returned no content");
    const u = body.usage ?? {};
    const prompt = u.inputTokens ?? 0;
    const completion = u.outputTokens ?? 0;
    return {
      content,
      model: req.model,
      usage: { promptTokens: prompt, completionTokens: completion, totalTokens: u.totalTokens ?? prompt + completion, estimatedCostUsd: 0 },
    };
  }

  // Converse has no cheap key probe; a configured key is reported usable and a refusal shows on the first call.
  async healthCheck(): Promise<ProviderHealth> {
    return this.isConfigured ? { ok: true } : { ok: false, detail: "Bedrock key missing" };
  }
}
