import { NextResponse } from "next/server";
import { runMonitorCron } from "@/lib/monitor/cron";
import { liveCronDeps } from "@/lib/monitor/live";
import { supabaseMonitorStore } from "@/lib/monitor/supabase-store";

// GET /api/cron/monitor (Part 4.2, DEC-001). Vercel Cron calls it once a day (Hobby allows once a
// day, +0 to 59 min); `?force=1` ignores due times and backoff for a manual re-run. Same auth as
// every cron route: `Authorization: Bearer $CRON_SECRET`, closed without the secret.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    return NextResponse.json({ ok: true, force, ...(await runMonitorCron(liveCronDeps(supabaseMonitorStore(), force))) });
  } catch (err) {
    console.error("monitor cron failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
