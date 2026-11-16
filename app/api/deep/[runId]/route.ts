// app/api/deep/[runId]/route.ts — second half of a pasted Deep run (Part 6.15, DEC-015).
// GET: the run's state and, while it waits for a reply, its prompt again (same numbering).
// POST { reply }: validates the pasted model reply item by item, stores the valid analyses, then
// clusters by the reply's market names, scores and reports. No model is called here.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { finishPastedRun, MIN_ANALYZED_SHARE } from "@/lib/runs/orchestrator";
import { createServerOrchestratorDeps } from "@/lib/runs/service-deps";
import { marketKey, NO_MARKET, parsePastedReply, PASTE_PROMPT_VERSION } from "@/lib/runs/pasted";
import { loadPastedRun, pastedRunState } from "@/lib/runs/pasted-run";
import { ownsRun, resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // database writes only

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REPLY_CHARS = 400_000;

// Not counted: the Deep run was counted when it started. Only its owner may read or finish it (Part 5.1).
const NOT_YOURS = { error: "This run belongs to another account. Sign in as the person who started it." };

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!UUID.test(runId)) return NextResponse.json({ error: "run id must be a uuid" }, { status: 400 });
  try {
    const loaded = await loadPastedRun(createServiceSupabaseClient(), runId);
    if (!loaded) return NextResponse.json({ error: `No run ${runId}` }, { status: 404 });
    if (!ownsRun(await resolveCaller(req.headers), loaded.run.user_id)) return NextResponse.json(NOT_YOURS, { status: 403 });
    return NextResponse.json({ ...pastedRunState(loaded.run, loaded.signals), promptVersion: PASTE_PROMPT_VERSION });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!UUID.test(runId)) return NextResponse.json({ error: "run id must be a uuid" }, { status: 400 });

  let reply: unknown;
  try {
    ({ reply } = (await req.json()) as { reply?: unknown });
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof reply !== "string" || reply.trim().length === 0 || reply.length > MAX_REPLY_CHARS) {
    return NextResponse.json({ error: `reply must be a non-empty string of at most ${MAX_REPLY_CHARS} characters` }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const loaded = await loadPastedRun(supabase, runId);
    if (!loaded) return NextResponse.json({ error: `No run ${runId}` }, { status: 404 });
    const { run, signals } = loaded;
    if (!ownsRun(await resolveCaller(req.headers), run.user_id)) return NextResponse.json(NOT_YOURS, { status: 403 });
    if (run.status !== "classifying") {
      return NextResponse.json({ error: `This run is ${run.status}. Only a run waiting for a reply can take one.` }, { status: 409 });
    }

    let parsed;
    try {
      parsed = parsePastedReply(reply, signals.length);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
    const { items, problems, missing } = parsed;
    // Signals the model found unrelated to the topic: analysed, but in no market.
    const noMarket = [...items.values()].filter((i) => marketKey(i.market) === NO_MARKET).length;
    const counts = { analysed: items.size, total: signals.length, noMarket, problems, missing };

    // Too little to report on: nothing is stored and the run keeps waiting, so the user can paste again.
    if (items.size / signals.length < MIN_ANALYZED_SHARE) {
      return NextResponse.json(
        {
          error: `Only ${items.size} of ${signals.length} items are valid; a run needs at least ${Math.round(MIN_ANALYZED_SHARE * 100)}%. Nothing was stored. Paste the full reply again.`,
          ...counts,
        },
        { status: 422 },
      );
    }

    const rows = [...items.entries()].map(([n, item]) => ({
      signal_id: signals[n - 1].id,
      audience: item.audience,
      problem: item.problem,
      intent: item.intent,
      urgency: item.urgency,
      pdf_relevance: item.pdf_relevance,
      embedding: null,
      prompt_version: PASTE_PROMPT_VERSION,
    }));
    const { error: upsertErr } = await supabase.from("signal_analysis").upsert(rows, { onConflict: "signal_id" });
    if (upsertErr) throw new Error(`Failed to save the analyses: ${upsertErr.message}`);

    const marketLabels = new Map([...items.entries()].map(([n, item]) => [signals[n - 1].id, item.market]));
    const summary = await finishPastedRun(
      { runId: run.id, query: run.query, mode: run.mode, startedAt: run.started_at, seed: run.query },
      createServerOrchestratorDeps({ marketLabels }),
      problems.length + missing.length,
    );
    return NextResponse.json({ run: summary, ...counts }, { status: summary.status === "completed" ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
