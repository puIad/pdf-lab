// app/api/runs/route.ts — Phase 1 Part 1.5 research runs API.
// POST: Executes full 10-state research run with evidence store and QC enforcement.
// GET: Lists recent research runs.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { executeResearchRun } from "@/lib/runs/orchestrator";
import { createServerOrchestratorDeps } from "@/lib/runs/service-deps";

export const dynamic = "force-dynamic";

interface CreateRunBody {
  query?: unknown;
  mode?: unknown;
  limit?: unknown;
  source_keys?: unknown;
}

const VALID_MODES = ["explore", "validate", "hunt", "deep", "monitor"] as const;

export async function POST(req: Request) {
  // Auth guard (pre-Phase 5 lightweight secret key)
  const authHeader = req.headers.get("x-api-key");
  if (authHeader !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  try {
    const deps = createServerOrchestratorDeps();
    const result = await executeResearchRun(
      {
        query: body.query.trim(),
        mode,
        limit,
        sourceKeys,
      },
      deps,
    );

    const httpStatus = result.status === "completed" ? 200 : 502;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to execute research run: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

export async function GET() {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select("id, query, mode, status, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: `Failed to list runs: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}
