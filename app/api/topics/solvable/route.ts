// app/api/topics/solvable/route.ts — Solvable Topics API.
// Returns trending topics filtered strictly by PDF suitability (evaluates realistic PDF deliverables).

import { NextResponse } from "next/server";
import { trendingRadarService } from "@/lib/trends/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitStr = searchParams.get("limit");
  const minPdfFitStr = searchParams.get("minPdfFit");

  const limit = limitStr ? Math.min(50, Math.max(1, parseInt(limitStr, 10))) : 25;
  const minPdfFit = minPdfFitStr ? parseFloat(minPdfFitStr) : 0.65;

  try {
    const opportunities = trendingRadarService.getSolvableOpportunities(limit, minPdfFit);
    return NextResponse.json({
      ok: true,
      count: opportunities.length,
      filters: { limit, minPdfFit },
      opportunities,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch solvable topics: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
