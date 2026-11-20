import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { routerForUser } from "@/lib/keys/server";
import { BriefUnavailable, DESCRIPTION_KEY, loadBrief, parseBriefSource } from "@/lib/brief";
import { writeBriefNote } from "@/lib/brief/notes";
import { enforceQuota, refund } from "@/lib/quotas/guard";

// POST /api/briefs/notes { source, key } — Phase 3 Part 3.10: one click = one cheap-tier AI note for an
// outline heading, or `key: "description"` for the listing description. The brief is rebuilt from
// stored rows first, so the model only ever sees cited lines. It spends an LLM call, so it is
// counted as one check against the caller's plan (Part 5.1).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { source?: unknown; key?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.key !== "string" || !body.key || body.key.length > 200) {
    return NextResponse.json({ error: `key must be an outline heading or "${DESCRIPTION_KEY}"` }, { status: 400 });
  }
  const guard = await enforceQuota(req.headers, "check");
  if (guard.denied) return guard.denied;
  try {
    const brief = await loadBrief(createServiceSupabaseClient(), parseBriefSource(body.source));
    const { router } = await routerForUser(guard.caller.userId);
    const note = await writeBriefNote(router, brief, body.key);
    return NextResponse.json({ key: body.key, note });
  } catch (err) {
    await refund(guard); // no note written: it does not count
    if (err instanceof BriefUnavailable) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
