// lib/usage/ledger.ts: the AI usage ledger (Part 5.2). One row per model call: tokens, a cost
// estimate, and which key paid. It feeds the pricing of Part 5.3. Pure over a LedgerStore.

import type { KeySource, MeteredCall, TaskTier } from "../ai/types.ts";

export type CostBasis = "reported" | "table" | "unpriced";

export interface LedgerRow {
  userId: string | null;
  runId: string | null;
  provider: string;
  model: string;
  tier: TaskTier;
  keySource: KeySource;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  costBasis: CostBasis;
}

export interface LedgerStore {
  insert(row: LedgerRow): Promise<void>;
}

// shortcut: list prices in USD per million tokens (input, output) for models a BYOK person is likely
// to use, as published by each vendor when this was written. A model not listed is "unpriced" (cost 0,
// tokens still counted) rather than guessed. Re-check against the vendor pages before Part 5.3 prices a plan.
const RATES: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /^gpt-4o-mini/, input: 0.15, output: 0.6 },
  { match: /^gpt-4o/, input: 2.5, output: 10 },
  { match: /^text-embedding-3-small/, input: 0.02, output: 0 },
  { match: /^openai\/text-embedding-3-small/, input: 0.02, output: 0 },
  { match: /^gemini-2\.5-flash-lite/, input: 0.1, output: 0.4 },
  { match: /^gemini-2\.5-flash/, input: 0.3, output: 2.5 },
];

/** Cost of one call: what the provider reported, else the rate table, else unpriced. */
export function priceCall(call: Pick<MeteredCall, "model" | "usage">): { usd: number; basis: CostBasis } {
  if (call.usage.estimatedCostUsd > 0) return { usd: call.usage.estimatedCostUsd, basis: "reported" };
  const rate = RATES.find((r) => r.match.test(call.model));
  if (!rate) return { usd: 0, basis: "unpriced" };
  const usd = (call.usage.promptTokens * rate.input + call.usage.completionTokens * rate.output) / 1_000_000;
  return { usd: Math.round(usd * 1e6) / 1e6, basis: "table" };
}

export interface MeterContext {
  /** Set once the run exists; calls before that are recorded without a run. */
  runId: string | null;
}

/** The router's `onCall` hook: writes one ledger row per call. */
export function makeMeter(store: LedgerStore, userId: string | null, ctx: MeterContext) {
  return async (call: MeteredCall): Promise<void> => {
    const { usd, basis } = priceCall(call);
    await store.insert({
      userId,
      runId: ctx.runId,
      provider: call.provider,
      model: call.model,
      tier: call.tier,
      keySource: call.keySource,
      promptTokens: call.usage.promptTokens,
      completionTokens: call.usage.completionTokens,
      totalTokens: call.usage.totalTokens,
      estimatedCostUsd: usd,
      costBasis: basis,
    });
  };
}

export interface LedgerTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byKeySource: Record<KeySource, { calls: number; totalTokens: number; estimatedCostUsd: number }>;
}

/** Sums ledger rows (one run, one user, or a period). */
export function totalLedger(rows: LedgerRow[]): LedgerTotals {
  const empty = () => ({ calls: 0, totalTokens: 0, estimatedCostUsd: 0 });
  const t: LedgerTotals = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, byKeySource: { byok: empty(), hosted: empty() } };
  for (const r of rows) {
    t.calls++;
    t.promptTokens += r.promptTokens;
    t.completionTokens += r.completionTokens;
    t.totalTokens += r.totalTokens;
    t.estimatedCostUsd += r.estimatedCostUsd;
    const s = t.byKeySource[r.keySource];
    s.calls++;
    s.totalTokens += r.totalTokens;
    s.estimatedCostUsd += r.estimatedCostUsd;
  }
  t.estimatedCostUsd = Math.round(t.estimatedCostUsd * 1e6) / 1e6;
  return t;
}
