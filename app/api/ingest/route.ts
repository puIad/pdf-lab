import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/pipeline";
import { getServiceDeps } from "@/lib/ingest/service-deps";

// POST /api/ingest { query, limit?, sources? } — Phase 1 Part 1.2.
// Collect → normalize → dedup → insert across registered adapters.
// Per-source counts are always returned; a dead adapter reports
// `skipped`/`failed` with its error — it never sinks the run (PRD §55).
// Server-only (service-role DB writes). No auth in MVP; Phase 5 gates this.

export const dynamic = "force-dynamic";

interface IngestBody {
  query?: unknown;
  limit?: unknown;
  sources?: unknown;
}

export async function POST(req: Request) {
  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return NextResponse.json({ error: "query (non-empty string) is required" }, { status: 400 });
  }
  if (body.limit !== undefined && (typeof body.limit !== "number" || body.limit <= 0)) {
    return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
  }
  if (
    body.sources !== undefined &&
    (!Array.isArray(body.sources) || body.sources.some((s) => typeof s !== "string"))
  ) {
    return NextResponse.json({ error: "sources must be an array of adapter keys" }, { status: 400 });
  }
  try {
    const summary = await runIngest(
      {
        query: body.query,
        limit: body.limit,
        sourceKeys: body.sources as string[] | undefined,
      },
      getServiceDeps(),
    );
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.startsWith("unknown source keys") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
