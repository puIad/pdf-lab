import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { parseSettings } from "@/lib/alerts/alerts";
import { resolveCaller } from "@/lib/quotas/guard";

// PATCH /api/alerts/settings (Part 4.3): mute a watch's alerts and/or set its threshold.
// Seed watch: opportunity score 1 to 100. Market watch: new buyer-intent signals in one re-run.

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!caller.userId) return NextResponse.json({ error: "Sign in to change alert settings." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  const parsed = parseSettings(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const db = createServiceSupabaseClient();
    // The watch must be the caller's own seed or market row.
    const { data: watch, error: wErr } = await db.from("watchlists").select("id").eq("id", parsed.watchId).eq("user_id", caller.userId).in("kind", ["seed", "market"]).maybeSingle();
    if (wErr) throw new Error(wErr.message);
    if (!watch) return NextResponse.json({ error: "No such seed or market on your watchlist." }, { status: 404 });
    const { data: old } = await db.from("alert_settings").select("threshold, muted").eq("watch_id", parsed.watchId).maybeSingle();
    const row = {
      watch_id: parsed.watchId,
      user_id: caller.userId,
      threshold: "threshold" in parsed ? parsed.threshold : (old?.threshold ?? null),
      muted: parsed.muted ?? old?.muted ?? false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("alert_settings").upsert(row, { onConflict: "watch_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ watchId: row.watch_id, threshold: row.threshold, muted: row.muted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
