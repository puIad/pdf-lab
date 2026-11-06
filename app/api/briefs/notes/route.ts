import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getRouter } from "@/lib/ai/index";
import { BriefUnavailable, DESCRIPTION_KEY, loadBrief, parseBriefSource } from "@/lib/brief";
import { writeBriefNote } from "@/lib/brief/notes";

// POST /api/briefs/notes { source, key } — Phase 3 Part 3.10: one click = one cheap-tier AI note for an
// outline heading, or `key: "description"` for the listing description. The brief is rebuilt from
// stored rows first, so the model only ever sees cited lines. Open in local dev; in production it
// needs the internal key until Phase 5 auth (it spends LLM calls).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const key = process.env.INTERNAL_API_KEY;
    if (!key || req.headers.get("x-api-key") !== key) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  let body: { source?: unknown; key?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.key !== "string" || !body.key || body.key.length > 200) {
    return NextResponse.json({ error: `key must be an outline heading or "${DESCRIPTION_KEY}"` }, { status: 400 });
  }
  try {
    const brief = await loadBrief(createServiceSupabaseClient(), parseBriefSource(body.source));
    const note = await writeBriefNote(getRouter(), brief, body.key);
    return NextResponse.json({ key: body.key, note });
  } catch (err) {
    if (err instanceof BriefUnavailable) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
