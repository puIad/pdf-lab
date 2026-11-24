// app/api/deep/[runId]/route.ts — second half of a pasted Deep run (Part 6.15, DEC-015).
// GET: the run's state and, while it waits for a reply, its prompt again (same numbering).
// POST { reply }: validates the pasted model reply item by item, stores the valid analyses, then
// hands clustering by the reply's market names, scoring and the report to a background workflow (202).
// No model is called here.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { MIN_ANALYZED_SHARE, needsAnalysis } from "@/lib/runs/orchestrator";
import { startFinishRun } from "@/lib/runs/start-deep";
import { marketKey, NO_MARKET, parsePastedReply, PASTE_PROMPT_VERSION } from "@/lib/runs/pasted";
import { loadPastedRun, pastedRunState } from "@/lib/runs/pasted-run";
import { ownsRun, resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // database writes and the workflow start; the report is built by the workflow

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
    // A signal an earlier run analysed keeps that analysis and its embedding, as it does in a model
    // run; the reply still names its market (issue #40).
    // One stored before the names-a-problem flag existed (issue #103) is analysed again by the reply.
    const isKept = (n: number) => !needsAnalysis(signals[n - 1]);
    const kept = [...items.keys()].filter(isKept).length;
    const counts = { analysed: items.size, total: signals.length, noMarket, kept, problems, missing };

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

    // Claim the run before storing anything: of two replies sent together, only one wins.
    const { data: claimed, error: claimErr } = await supabase
      .from("research_runs")
      .update({ status: "clustering" })
      .eq("id", run.id)
      .eq("status", "classifying")
      .select("id");
    if (claimErr) throw new Error(`Failed to claim the run: ${claimErr.message}`);
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "This run already has a reply. Open its progress instead." }, { status: 409 });
    }

    const rows = [...items.entries()].filter(([n]) => !isKept(n)).map(([n, item]) => ({
      signal_id: signals[n - 1].id,
      audience: item.audience,
      problem: item.problem,
      intent: item.intent,
      urgency: item.urgency,
      pdf_relevance: item.pdf_relevance,
      names_problem: item.names_problem,
      embedding: null,
      prompt_version: PASTE_PROMPT_VERSION,
    }));
    const { error: upsertErr } = rows.length ? await supabase.from("signal_analysis").upsert(rows, { onConflict: "signal_id" }) : { error: null }; // every signal already kept: nothing to save
    if (upsertErr) {
      await supabase.from("research_runs").update({ status: "classifying" }).eq("id", run.id); // nothing stored: the reply can be sent again
      throw new Error(`Failed to save the analyses: ${upsertErr.message}`);
    }

    // Clustering, scoring and the report take longer than a request may: a workflow does them
    // (issue #24). The page polls GET /api/runs/<id>.
    const marketLabels = [...items.entries()].map(([n, item]): [string, string] => [signals[n - 1].id, item.market]);
    await startFinishRun({
      runId: run.id,
      query: run.query,
      seed: run.query,
      mode: run.mode,
      startedAt: run.started_at,
      userId: run.user_id,
      marketLabels,
      replyFailures: problems.length + missing.length,
    });
    return NextResponse.json({ runId: run.id, status: "clustering", poll: `/api/runs/${run.id}`, ...counts }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
