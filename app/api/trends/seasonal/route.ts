// app/api/trends/seasonal/route.ts — PRD §24 Seasonal Surge API.
// Surfaces markets likely to surge in the next 30..60 days with dated historical proof.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getTrendingRadarService } from "@/lib/trends/load";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const radar = await getTrendingRadarService(createServiceSupabaseClient());
    const upcomingSurges = radar.getUpcomingSeasonalSurges();
    return NextResponse.json({
      ok: true,
      count: upcomingSurges.length,
      upcomingSurges,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch seasonal surges: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
