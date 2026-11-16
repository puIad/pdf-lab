// app/api/deep/route.ts — POST /api/deep { seed, limit? } (Part 6.15, DEC-015).
// First half of a Deep run: collect the seed's signals, stop before analysis, and return the
// prompt the user pastes into a chat model. No model is called here. The reply goes to
// POST /api/deep/<runId>. Counted as one Deep run against the caller's plan; the run is theirs (Part 5.1).

import { NextResponse } from "next/server";
import { startPastedRun } from "@/lib/runs/orchestrator";
import { createServerOrchestratorDeps } from "@/lib/runs/service-deps";
import { buildPastePrompt, PASTE_PROMPT_VERSION, promptSignals } from "@/lib/runs/pasted";
import { enforceQuota } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // ingest: about 15 s of throttled adapter calls

export async function POST(req: Request) {
  let seed: unknown;
  let limit: unknown;
  try {
    ({ seed, limit } = (await req.json()) as { seed?: unknown; limit?: unknown });
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof seed !== "string" || seed.trim().length < 2 || seed.trim().length > 80) {
    return NextResponse.json({ error: "seed must be a 2 to 80 character string" }, { status: 400 });
  }
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return NextResponse.json({ error: "limit must be an integer from 1 to 50" }, { status: 400 });
  }
  const guard = await enforceQuota(req.headers, "deep");
  if (guard.denied) return guard.denied;

  try {
    const topic = seed.trim();
    const run = await startPastedRun({ query: topic, seed: topic, mode: "deep", limit: (limit as number | undefined) ?? 25, userId: guard.caller.userId }, createServerOrchestratorDeps());
    if (run.status !== "awaiting_reply") {
      return NextResponse.json({ error: run.error ?? "The run failed while collecting signals.", runId: run.runId, trace: run.trace }, { status: 502 });
    }
    const signals = promptSignals(run.signals);
    return NextResponse.json({
      runId: run.frame.runId,
      seed: topic,
      status: "classifying",
      signals: signals.length,
      sources: run.sources,
      prompt: buildPastePrompt(topic, signals),
      promptVersion: PASTE_PROMPT_VERSION,
      quota: guard.quota,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
