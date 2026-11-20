import { NextResponse } from "next/server";
import { supabaseRetentionStore } from "@/lib/retention/supabase-store";
import { runYouTubeRetention } from "@/lib/retention/youtube-retention";
import { getAdapter } from "@/lib/sources";
import type { Refresher } from "@/lib/retention/youtube-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the secret the route is closed.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // Adapters are reached through the registry only (ADAPTERS.md rule 1).
    const adapter = getAdapter("youtube") as unknown as Refresher | undefined;
    if (!adapter) throw new Error("youtube adapter not registered");
    const result = await runYouTubeRetention({ store: supabaseRetentionStore(), refresher: adapter });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("youtube retention failed", err);
    return NextResponse.json(
      { ok: false, error: "retention job failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
