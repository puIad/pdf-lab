import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { loadAlerts, loadDigest } from "@/lib/alerts/load";
import { resolveCaller } from "@/lib/quotas/guard";
import { listWatches } from "@/lib/watchlist/store";

// Part 4.3. GET /api/alerts: the signed-in person's alerts, their per-watch settings and the weekly
// digest. POST /api/alerts marks every unread alert read. In-app only: nothing is emailed or pushed.

export const dynamic = "force-dynamic";

const signIn = () => NextResponse.json({ error: "Sign in to see your alerts." }, { status: 401 });
const failed = (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });

export async function GET(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!caller.userId) return signIn();
  try {
    return NextResponse.json({ ...(await loadAlerts(caller.userId)), digest: await loadDigest(await listWatches(caller.userId)) });
  } catch (err) {
    return failed(err);
  }
}

export async function POST(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!caller.userId) return signIn();
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", caller.userId)
      .is("read_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ marked: data.length });
  } catch (err) {
    return failed(err);
  }
}
