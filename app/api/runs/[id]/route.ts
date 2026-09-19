// app/api/runs/[id]/route.ts — Phase 1 Part 1.5 run progress endpoint.
// Exposes progress, lifecycle state, trace, and research completeness per PRD §38 & §55.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { fetchRunCompleteness } from "@/lib/runs/completeness";
import { LIFECYCLE_STATES } from "@/lib/runs/types";
import type { LifecycleState, LifecycleTraceStep } from "@/lib/runs/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;

  if (!id) {
    return NextResponse.json({ error: "run id is required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .select("id, query, mode, status, started_at, completed_at, user_id")
    .eq("id", id)
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: `Research run not found: ${id}` }, { status: 404 });
  }

  const currentStatus = run.status as LifecycleState;
  const completeness = await fetchRunCompleteness(supabase, run.query).catch(() => ({
    sourcesCovered: 0,
    signalsCollected: 0,
    signalsAnalyzed: 0,
    marketsIdentified: 0,
    opportunitiesGenerated: 0,
    evidenceCount: 0,
    evidenceBackedOpportunitiesCount: 0,
    completenessPercentage: 0,
  }));

  // Reconstruct lifecycle trace for UI progress display (PRD §38)
  const currentIdx = LIFECYCLE_STATES.indexOf(
    currentStatus as (typeof LIFECYCLE_STATES)[number],
  );

  const trace: LifecycleTraceStep[] = [];
  if (currentStatus === "failed") {
    trace.push({
      state: "queued",
      timestamp: run.started_at,
      message: "Run initialized",
    });
    trace.push({
      state: "failed",
      timestamp: run.completed_at || new Date().toISOString(),
      message: "Run terminated with failure",
    });
  } else {
    for (let i = 0; i <= (currentIdx >= 0 ? currentIdx : 0); i++) {
      const state = LIFECYCLE_STATES[i];
      trace.push({
        state,
        timestamp: i === 0 ? run.started_at : (i === currentIdx && run.completed_at ? run.completed_at : run.started_at),
        message: `Run stage: ${state}`,
      });
    }
  }

  return NextResponse.json({
    run: {
      id: run.id,
      userId: run.user_id,
      query: run.query,
      mode: run.mode,
      status: currentStatus,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    },
    lifecycle: {
      currentState: currentStatus,
      trace,
    },
    completeness,
  });
}
