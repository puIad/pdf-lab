// app/api/metrics/vote/route.ts — "was this opportunity useful?" (Phase 6 Part 6.2, PRD §58).
// POST { opportunityId, useful }. One vote per signed-in person per opportunity; a second vote
// changes it. Signed out: 401.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { parseVote, voteEvent } from "@/lib/analytics/metrics";
import { recordEvent } from "@/lib/analytics/store";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { opportunityId?: unknown; useful?: unknown } | null;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  const vote = parseVote(body);
  if ("error" in vote) return NextResponse.json({ error: vote.error }, { status: 400 });
  try {
    const caller = await resolveCaller(req.headers);
    if (!caller.userId) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
    const db = createServiceSupabaseClient();
    const { data, error } = await db.from("opportunities").select("id").eq("id", vote.opportunityId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "No such opportunity." }, { status: 404 });
    await recordEvent(db, voteEvent(caller.userId, vote.opportunityId, vote.useful));
    return NextResponse.json({ voted: true, useful: vote.useful });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
