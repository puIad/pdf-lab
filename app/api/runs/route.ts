// app/api/runs/route.ts — Phase 1 Part 1.5 research runs API.
// POST: starts a full 10-state research run as a background workflow and returns its id (202).
// GET: Lists recent research runs.

import { NextResponse } from "next/server";
import { enforceQuota, resolveCaller } from "@/lib/quotas/guard";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { startModelRun } from "@/lib/runs/start-deep";
import { pastedModeResponse } from "@/lib/settings/pasted-gate";

export const dynamic = "force-dynamic";

interface CreateRunBody {
  query?: unknown;
  mode?: unknown;
  limit?: unknown;
  source_keys?: unknown;
}

const VALID_MODES = ["explore", "validate", "hunt", "deep", "monitor"] as const;

export async function POST(req: Request) {
  // Pipeline endpoint: the server key only (Part 5.1).
  const guard = await enforceQuota(req.headers, "internal");
  if (guard.denied) return guard.denied;

  let body: CreateRunBody;
  try {
    const rawBody = await req.json();
    if (!rawBody || typeof rawBody !== "object") throw new Error("Invalid body");
    body = rawBody as CreateRunBody;
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON object" }, { status: 400 });
  }

  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return NextResponse.json({ error: "query must be a non-empty string" }, { status: 400 });
  }

  let mode: "explore" | "validate" | "hunt" | "deep" | "monitor" = "deep";
  if (body.mode !== undefined) {
    if (typeof body.mode !== "string" || !VALID_MODES.includes(body.mode as (typeof VALID_MODES)[number])) {
      return NextResponse.json(
        { error: `mode must be one of: ${VALID_MODES.join(", ")}` },
        { status: 400 },
      );
    }
    mode = body.mode as typeof mode;
  }

  let limit = 25;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || body.limit <= 0) {
      return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
    }
    limit = Math.min(100, Math.floor(body.limit));
  }

  let sourceKeys: string[] | undefined;
  if (body.source_keys !== undefined) {
    if (!Array.isArray(body.source_keys) || body.source_keys.some((k) => typeof k !== "string")) {
      return NextResponse.json({ error: "source_keys must be an array of strings" }, { status: 400 });
    }
    sourceKeys = body.source_keys as string[];
  }

  // Every mode runs extraction, so pasted replies gate them all (Part 6.9).
  const pasted = await pastedModeResponse();
  if (pasted) return pasted;

  try {
    // The run row exists when this returns; a workflow does the rest (issue #24). Poll GET /api/runs/<id>.
    const { runId } = await startModelRun({ query: body.query.trim().replace(/\s+/g, " "), mode, limit, sourceKeys });
    return NextResponse.json({ runId, status: "queued", poll: `/api/runs/${runId}` }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to start the research run: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  // A run's query is private to whoever started it; the server key and a dev server see all (Part 5.1).
  const caller = await resolveCaller(req.headers);
  if (caller.plan === "anon") return NextResponse.json({ runs: [] });
  const supabase = createServiceSupabaseClient();
  const list = supabase
    .from("research_runs")
    .select("id, query, mode, status, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(20);
  const { data, error } = await (caller.userId ? list.eq("user_id", caller.userId) : list);

  if (error) {
    return NextResponse.json({ error: `Failed to list runs: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}
