// app/api/trends/delta/route.ts — Comparative Trend Delta API.
// Calculates velocity, maturity, and trajectory deltas between two time windows.

import { NextResponse } from "next/server";
import { trendingRadarService } from "@/lib/trends/service";
import type { TimeWindow } from "@/lib/trends/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const marketId = searchParams.get("marketId");
  const base = (searchParams.get("base") || "7d") as TimeWindow;
  const target = (searchParams.get("target") || "30d") as TimeWindow;

  if (!marketId) {
    return NextResponse.json(
      { error: "Query parameter 'marketId' is required" },
      { status: 400 }
    );
  }

  const validWindows: TimeWindow[] = ["7d", "30d", "90d", "12m"];
  if (!validWindows.includes(base) || !validWindows.includes(target)) {
    return NextResponse.json(
      { error: "Invalid base or target window. Must be one of: 7d, 30d, 90d, 12m" },
      { status: 400 }
    );
  }

  try {
    const delta = trendingRadarService.getTopicDelta(marketId, base, target);
    if (!delta) {
      return NextResponse.json(
        { error: `Market with ID '${marketId}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      delta,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to compute trend delta: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
