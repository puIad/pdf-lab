// app/api/usage/route.ts: the signed-in person's AI usage ledger (Phase 5 Part 5.2).
// GET /api/usage?run=<id> totals one run; without `run` it totals this UTC month. Each total is
// split by who paid, the person's own key (`byok`) or the hosted quota (`hosted`).

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";
import { totalLedger, type LedgerRow } from "@/lib/usage/ledger";

export const dynamic = "force-dynamic";

const ROW_CAP = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const { userId } = await resolveCaller(req.headers);
  if (!userId) return NextResponse.json({ error: "Sign in to see your AI usage." }, { status: 401 });
  const run = new URL(req.url).searchParams.get("run");
  if (run !== null && !UUID.test(run)) return NextResponse.json({ error: "run must be a uuid" }, { status: 400 });

  let q = createServiceSupabaseClient()
    .from("ai_usage_ledger")
    .select("provider, model, tier, key_source, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, cost_basis")
    .eq("user_id", userId);
  if (run) q = q.eq("run_id", run);
  else {
    const now = new Date();
    q = q.gte("created_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString());
  }
  const { data, error } = await q.limit(ROW_CAP);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows: LedgerRow[] = (data ?? []).map((r) => ({
    userId,
    runId: run,
    provider: r.provider,
    model: r.model,
    tier: r.tier,
    keySource: r.key_source,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    totalTokens: r.total_tokens,
    estimatedCostUsd: Number(r.estimated_cost_usd),
    costBasis: r.cost_basis,
  }));
  // shortcut: totals are summed here from at most ROW_CAP rows; move to a SQL sum() before Part 5.3 bills from this.
  return NextResponse.json({ scope: run ? "run" : "month", runId: run, totals: totalLedger(rows), truncated: rows.length >= ROW_CAP });
}
