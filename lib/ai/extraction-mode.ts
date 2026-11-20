// lib/ai/extraction-mode.ts — the extraction mode (Part 6.9, DEC-015): one chat model that passed a
// response test, or pasted replies (the /deep flow). Pure: the router and the store are passed in.

import type { AIRouter } from "./router.ts";
import { NVIDIA_DEFAULT_CHAT_MODEL } from "./providers/openai-compatible.ts";
import { OPENROUTER_DEFAULT_CHEAP_MODEL } from "./providers/openrouter.ts";
import { OLLAMA_DEFAULT_MODEL } from "./providers/ollama.ts";

export type ExtractionMode = { kind: "model"; provider: string; model: string } | { kind: "pasted" };

export const PASTED_MODE: ExtractionMode = { kind: "pasted" };

export interface ModelCandidate {
  provider: string;
  model: string;
  /** Why it is listed: what DEC-015 measured, or that it is the provider's default. */
  note: string;
  /** Calls on this provider can cost money. */
  paid?: boolean;
}

/** Chat models worth trying per provider. DEC-015 (2026-11-13) measured the NVIDIA ones. */
export function candidateModels(configuredProviders: string[], env: NodeJS.ProcessEnv = process.env): ModelCandidate[] {
  const all: ModelCandidate[] = [
    { provider: "nvidia", model: NVIDIA_DEFAULT_CHAT_MODEL, note: "The old default. Gone (HTTP 410) since 2026-11-18." },
    { provider: "nvidia", model: "nvidia/nemotron-3.5-bolt-e4b", note: "Fast: 30 of 30 signals in 77 s, but rates intent differently." },
    { provider: "nvidia", model: "minimaxai/minimax-m3.1-flash", note: "Closest to the stored analyses, but failed 60 % of calls." },
    { provider: "openrouter", model: env.OPENROUTER_CHEAP_MODEL || OPENROUTER_DEFAULT_CHEAP_MODEL, note: "Free pool: 50 calls a day without credits." },
    { provider: "ollama", model: env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL, note: "Local model, no key." },
    { provider: "openai-compatible", model: env.OPENAI_CHEAP_MODEL || "gpt-4o-mini", note: "Your OPENAI_BASE_URL endpoint.", paid: true },
  ];
  const envModel = env.NVIDIA_CHEAP_MODEL;
  if (envModel && !all.some((c) => c.provider === "nvidia" && c.model === envModel)) {
    all.push({ provider: "nvidia", model: envModel, note: "Set by NVIDIA_CHEAP_MODEL." });
  }
  return all.filter((c) => configuredProviders.includes(c.provider));
}

export function isModelMode(mode: ExtractionMode | null): mode is Extract<ExtractionMode, { kind: "model" }> {
  return mode?.kind === "model";
}

/** Parses a stored or posted value; anything that is not a valid mode is `null`. */
export function parseExtractionMode(raw: unknown): ExtractionMode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "pasted") return PASTED_MODE;
  if (r.kind === "model" && typeof r.provider === "string" && typeof r.model === "string") {
    const provider = r.provider.trim();
    const model = r.model.trim();
    if (provider && model && model.length <= 200) return { kind: "model", provider, model };
  }
  return null;
}

export function describeMode(mode: ExtractionMode | null): string {
  if (!mode) return "Not chosen";
  return mode.kind === "pasted" ? "Pasted replies" : `${mode.model} on ${mode.provider}`;
}

export interface ModelTestResult {
  answered: boolean;
  ms: number;
  /** First characters of the reply when it answered. */
  reply?: string;
  error?: string;
}

export const TEST_TIMEOUT_MS = 45_000;

type TestRouter = Pick<AIRouter, "generateText" | "configuredProviderNames">;

/** One short chat call. It answered when a non-empty reply came back in time; never throws. */
export async function testModel(
  router: TestRouter,
  target: { provider: string; model: string },
  timeoutMs = TEST_TIMEOUT_MS,
  nowFn: () => number = Date.now,
): Promise<ModelTestResult> {
  const t0 = nowFn();
  if (!router.configuredProviderNames().includes(target.provider)) {
    return { answered: false, ms: 0, error: `provider '${target.provider}' is not configured` };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      router.generateText({
        tier: "cheap",
        providerName: target.provider,
        model: target.model,
        system: "Answer in one short word.",
        user: "Say ok.",
        temperature: 0,
        maxTokens: 32,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      }),
    ]);
    const ms = nowFn() - t0;
    const reply = res.text.trim();
    return reply ? { answered: true, ms, reply: reply.slice(0, 40) } : { answered: false, ms, error: "empty reply" };
  } catch (err) {
    return { answered: false, ms: nowFn() - t0, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Saving a model mode needs a passed test: this runs it and answers whether the mode may be stored. */
export async function checkModeForSave(
  router: TestRouter,
  mode: ExtractionMode,
  timeoutMs?: number,
): Promise<{ ok: true; test?: ModelTestResult } | { ok: false; test: ModelTestResult }> {
  if (mode.kind === "pasted") return { ok: true };
  const test = await testModel(router, mode, timeoutMs);
  return test.answered ? { ok: true, test } : { ok: false, test };
}
