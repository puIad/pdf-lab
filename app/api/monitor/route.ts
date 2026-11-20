import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/quotas/guard";
import { loadMonitorView } from "@/lib/monitor/view";
import { supabaseMonitorStore } from "@/lib/monitor/supabase-store";
import { listWatches } from "@/lib/watchlist/store";

// GET /api/monitor (Part 4.2): the change reports and seed snapshots diffs of the signed-in
// person's own watchlist rows. Signed out: 401. Re-runs themselves are started only by the cron
// route (app/api/cron/monitor), never by a visitor.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!caller.userId) return NextResponse.json({ error: "Sign in to see your watchlist changes." }, { status: 401 });
  try {
    return NextResponse.json(await loadMonitorView(supabaseMonitorStore(), await listWatches(caller.userId)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
