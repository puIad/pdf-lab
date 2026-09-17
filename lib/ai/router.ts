// lib/ai/router.ts — AIRouter: single server-side entry for all LLM calls.
// Per docs/07-AI-ROUTER.md: app code calls router.generateObject /
// router.generateText — NEVER a provider directly. Provider per call is
// selected by task tier + availability:
//
//   1. AI_CHEAP_PROVIDER / AI_STRONG_PROVIDER env pin a provider, else the
//      tier default (cheap → ollama FIRST per spec, strong → openrouter).
//   2. If the selected provider is unconfigured or its healthCheck fails,
//      fall through to the next CONFIGURED provider (order: ollama,
//      openrouter, openai-compatible). The fallback is reported in the
//      result (`provider`, `fallbackFrom`) and the cost log — never silent
//      in the sense that callers can't see it, but automatic so a missing
//      local Ollama doesn't block hosted runs.
//
// Models per tier are env-overridable (OPENROUTER_CHEAP_MODEL,
// OLLAMA_MODEL, ...); changing the EMBED model is a migration (see 1.4).

import type {
  AIProvider,
  CallUsage,
  CostLogEntry,
  ProviderHealth,
  TaskTier,
} from "./types.ts";
import { addUsage, emptyUsage } from "./types.ts";
import { OLLAMA_DEFAULT_MODEL } from "./providers/ollama.ts";
import { OPENROUTER_DEFAULT_CHEAP_MODEL } from "./providers/openrouter.ts";

export interface TierSelection {
  tier: TaskTier;
  provider: string;
  model: string;
  fallbackFrom?: string;
}

export interface GenerateObjectResult<T> {
  object: T;
  usage: CallUsage;
  model: string;
  provider: string;
  fallbackFrom?: string;
  attempts: number;
}

const TIER_ENV: Record<TaskTier, { providerVar: string; modelVar: string }> = {
  cheap: { providerVar: "AI_CHEAP_PROVIDER", modelVar: "AI_CHEAP_MODEL" },
  strong: { providerVar: "AI_STRONG_PROVIDER", modelVar: "AI_STRONG_MODEL" },
  embed: { providerVar: "AI_EMBED_PROVIDER", modelVar: "AI_EMBED_MODEL" },
};

const TIER_DEFAULT_PROVIDER: Record<TaskTier, string> = {
  cheap: "ollama", // local-first per 07-AI-ROUTER; falls through when absent
  strong: "openrouter",
  embed: "openrouter",
};

const FALLBACK_ORDER = ["ollama", "openrouter", "openai-compatible"];

function defaultModelFor(provider: string, tier: TaskTier, env: NodeJS.ProcessEnv): string {
  const override = env[TIER_ENV[tier].modelVar];
  if (override) return override;
  if (provider === "ollama") return env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL;
  if (provider === "openrouter") {
    if (tier === "cheap") return env.OPENROUTER_CHEAP_MODEL || OPENROUTER_DEFAULT_CHEAP_MODEL;
    return env.OPENROUTER_STRONG_MODEL || OPENROUTER_DEFAULT_CHEAP_MODEL;
  }
  if (provider === "openai-compatible") {
    if (tier === "cheap") return env.OPENAI_CHEAP_MODEL || "gpt-4o-mini";
    return env.OPENAI_STRONG_MODEL || "gpt-4o";
  }
  return override || "";
}

export interface AIRouterOptions {
  nowFn?: () => number;
}

/** Strip markdown fences / leading prose so JSON.parse sees the object. */
export function extractJsonSlice(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[{[]/);
  if (start < 0) return candidate;
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  return end > start ? candidate.slice(start, end + 1).trim() : candidate;
}

export class AIRouter {
  private readonly providers = new Map<string, AIProvider>();
  private readonly env: NodeJS.ProcessEnv;
  private readonly nowFn: () => number;

  constructor(env: NodeJS.ProcessEnv = process.env, opts: AIRouterOptions = {}) {
    this.env = env;
    this.nowFn = opts.nowFn ?? Date.now;
  }

  register(provider: AIProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`AIProvider already registered for '${provider.name}'`);
    }
    this.providers.set(provider.name, provider);
  }

  providerNames(): string[] {
    return [...this.providers.keys()];
  }

  /** Resolve tier → provider+model WITHOUT network (config presence only). */
  resolveTier(tier: TaskTier): TierSelection {
    const pinned = this.env[TIER_ENV[tier].providerVar];
    const first = pinned || TIER_DEFAULT_PROVIDER[tier];
    const chain = [first, ...FALLBACK_ORDER.filter((n) => n !== first)];
    let fallbackFrom: string | undefined;
    for (const name of chain) {
      const provider = this.providers.get(name);
      if (!provider || !provider.isConfigured) {
        if (name === first) fallbackFrom = first;
        continue;
      }
      const sel: TierSelection = { tier, provider: name, model: defaultModelFor(name, tier, this.env) };
      if (fallbackFrom && name !== first) sel.fallbackFrom = fallbackFrom;
      return sel;
    }
    throw new Error(
      `no configured AI provider for tier '${tier}' (registered: ${this.providerNames().join(", ") || "none"}; ` +
        "set OPENROUTER_API_KEY or run Ollama locally)",
    );
  }

  /** Live health per registered provider (mirrors GET /api/sources/health). */
  async healthCheck(): Promise<Record<string, ProviderHealth & { configured: boolean }>> {
    const out: Record<string, ProviderHealth & { configured: boolean }> = {};
    for (const [name, provider] of this.providers) {
      try {
        const h = await provider.healthCheck();
        out[name] = { ...h, configured: provider.isConfigured };
      } catch (err) {
        out[name] = {
          ok: false,
          configured: provider.isConfigured,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return out;
  }

  async generateText(input: {
    tier: TaskTier;
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    providerName?: string;
  }): Promise<{ text: string; usage: CallUsage; model: string; provider: string; fallbackFrom?: string; latencyMs: number }> {
    const sel = input.providerName
      ? { tier: input.tier, provider: input.providerName, model: defaultModelFor(input.providerName, input.tier, this.env) }
      : this.resolveTier(input.tier);
    const chain = [sel.provider, ...FALLBACK_ORDER.filter((n) => n !== sel.provider)];
    let lastError: unknown = null;
    for (const name of chain) {
      const provider = this.providers.get(name);
      if (!provider || !provider.isConfigured) continue;
      // Skip providers that are provisioned but provably down (fast fail).
      if (name !== sel.provider) {
        const h = await provider.healthCheck().catch(() => ({ ok: false as const }));
        if (!h.ok) continue;
      }
      const t0 = this.nowFn();
      try {
        const res = await provider.chatComplete({
          model: sel.provider === name ? sel.model : defaultModelFor(name, input.tier, this.env),
          system: input.system,
          user: input.user,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        });
        return {
          text: res.content,
          usage: res.usage,
          model: res.model,
          provider: name,
          fallbackFrom: name === sel.provider ? sel.fallbackFrom : sel.provider,
          latencyMs: this.nowFn() - t0,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `all AI providers failed for tier '${input.tier}': ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  /**
   * Validated JSON generation. Retries once after a parse/validation failure
   * (usage summed across attempts). Throws when all attempts fail — the
   * caller records the failure; NOTHING is written (never invent rows).
   */
  async generateObject<T>(input: {
    tier: TaskTier;
    system: string;
    user: string;
    validate: (raw: unknown) => T;
    temperature?: number;
    maxTokens?: number;
    providerName?: string;
  }): Promise<GenerateObjectResult<T>> {
    const attempts: Array<{ text: string; usage: CallUsage; model: string; provider: string; fallbackFrom?: string }> = [];
    let usage = emptyUsage();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.generateText({
        tier: input.tier,
        system: `${input.system}\n\nReply with exactly one JSON object and no other text.`,
        user: attempt === 0 ? input.user : `${input.user}\n\n(Previous reply was not valid JSON — reply again with ONLY the JSON object.)`,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        providerName: input.providerName,
      });
      usage = addUsage(usage, res.usage);
      try {
        const parsed: unknown = JSON.parse(extractJsonSlice(res.text));
        const object = input.validate(parsed);
        return {
          object,
          usage,
          model: res.model,
          provider: res.provider,
          fallbackFrom: res.fallbackFrom,
          attempts: attempt + 1,
        };
      } catch (err) {
        lastError = err;
        attempts.push({ text: res.text, usage: res.usage, model: res.model, provider: res.provider });
      }
    }
    const preview = attempts.map((a) => a.text.slice(0, 200)).join(" || ");
    throw new Error(
      `provider returned invalid JSON/object twice: ${lastError instanceof Error ? lastError.message : String(lastError)} — preview: ${preview}`,
    );
  }

  costEntry(input: {
    tier: TaskTier;
    provider: string;
    model: string;
    usage: CallUsage;
    latencyMs: number;
  }): CostLogEntry {
    return {
      at: new Date(this.nowFn()).toISOString(),
      provider: input.provider,
      model: input.model,
      tier: input.tier,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      estimatedCostUsd: input.usage.estimatedCostUsd,
      latencyMs: input.latencyMs,
    };
  }
}
