// app/api/radar/route.ts — Phase 3 Part 3.3 Market Radar API.
// Returns synchronized 4-window radar snapshots or single window data with filters.

import { NextResponse } from "next/server";
import { trendingRadarService } from "@/lib/trends/service";
import type { RadarFilterOptions, TimeWindow } from "@/lib/trends/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const windowParam = searchParams.get("window") as TimeWindow | "all" | null;
  const sourceParam = searchParams.get("source") as "all" | "youtube" | "reddit" | null;
  const category = searchParams.get("category") || undefined;
  const minConfidenceStr = searchParams.get("minConfidence");
  const solvableOnlyStr = searchParams.get("solvableOnly");
  const search = searchParams.get("search") || undefined;

  const filterOptions: RadarFilterOptions = {
    source: sourceParam || "all",
    category: category || undefined,
    minConfidence: minConfidenceStr ? parseFloat(minConfidenceStr) : undefined,
    solvableOnly: solvableOnlyStr === "true",
    search: search || undefined,
  };

  try {
    if (!windowParam || windowParam === "all") {
      const snapshots = trendingRadarService.getFourWindowSnapshots(filterOptions);
      const upcomingSeasonal = trendingRadarService.getUpcomingSeasonalSurges();
      return NextResponse.json({
        ok: true,
        mode: "four_window",
        snapshots,
        upcomingSeasonal,
      });
    }

    const validWindows: TimeWindow[] = ["7d", "30d", "90d", "12m"];
    if (!validWindows.includes(windowParam)) {
      return NextResponse.json(
        { error: `Invalid window parameter '${windowParam}'. Valid options: 7d, 30d, 90d, 12m, all` },
        { status: 400 }
      );
    }

    const snapshot = trendingRadarService.getSnapshot(windowParam, filterOptions);
    return NextResponse.json({
      ok: true,
      mode: "single_window",
      snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to generate radar snapshot: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
