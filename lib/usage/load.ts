// lib/usage/load.ts: reads per-run ledger costs (Part 5.3). Server-only, service role.

import { createServiceSupabaseClient } from "@/lib/db/client";
import type { RunCost } from "./cost";

export const COST_WINDOW_DAYS = 30;

export async function loadRunCosts(days = COST_WINDOW_DAYS, now = new Date()): Promise<RunCost[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data, error } = await createServiceSupabaseClient().rpc("ledger_run_costs", { p_since: since });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ run_id: string; mode: string | null; calls: number; total_tokens: number; cost_usd: number | string; unpriced_calls: number }>).map((r) => ({
    runId: r.run_id,
    mode: r.mode,
    calls: Number(r.calls),
    totalTokens: Number(r.total_tokens),
    costUsd: Number(r.cost_usd),
    unpricedCalls: Number(r.unpriced_calls),
  }));
}
