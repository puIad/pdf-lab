// app/api/markets/route.ts — Phase 3 Part 3.1 Market Explorer API per PRD §7, §40.
// Returns DB-backed markets with evidence-derived scores, filter tabs, and counts.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { fetchMarketsData } from "@/lib/markets/fetcher";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "trending";
    const q = searchParams.get("q")?.toLowerCase().trim();
    const trendFilter = searchParams.get("trend")?.toLowerCase().trim();
    const competitionFilter = searchParams.get("competition")?.toLowerCase().trim();
    const pdfFitFilter = searchParams.get("pdf_fit")?.toLowerCase().trim();

    const supabase = createServiceSupabaseClient();
    const data = await fetchMarketsData(supabase);

    let filtered = [...data.markets];

    // 1. Text Search query
    if (q) {
      filtered = filtered.filter((m) => {
        const nameMatch = m.name.toLowerCase().includes(q);
        const descMatch = m.description?.toLowerCase().includes(q);
        const oppMatch = m.top_opportunity?.title.toLowerCase().includes(q);
        return nameMatch || descMatch || oppMatch;
      });
    }

    // 2. Trend filter
    if (trendFilter && trendFilter !== "all") {
      filtered = filtered.filter((m) => m.trend === trendFilter);
    }

    // 3. Competition filter
    if (competitionFilter && competitionFilter !== "all") {
      if (competitionFilter === "low") {
        filtered = filtered.filter((m) => m.competition_score < 30);
      } else if (competitionFilter === "moderate") {
        filtered = filtered.filter((m) => m.competition_score >= 30 && m.competition_score <= 70);
      } else if (competitionFilter === "high") {
        filtered = filtered.filter((m) => m.competition_score > 70);
      }
    }

    // 4. PDF Fit filter
    if (pdfFitFilter && pdfFitFilter !== "all") {
      if (pdfFitFilter === "high") {
        filtered = filtered.filter((m) => m.pdf_fit_score >= 60);
      } else if (pdfFitFilter === "moderate") {
        filtered = filtered.filter((m) => m.pdf_fit_score >= 40 && m.pdf_fit_score < 60);
      } else if (pdfFitFilter === "low") {
        filtered = filtered.filter((m) => m.pdf_fit_score < 40);
      }
    }

    // 5. Apply Tab sorting / prioritization per PRD §40
    if (tab === "trending") {
      // Trending: Prioritize accelerating & emerging trends, then demand momentum
      const trendWeight: Record<string, number> = {
        accelerating: 400,
        emerging: 300,
        seasonal: 200,
        stable: 100,
        unknown: 50,
        declining: 0,
      };
      filtered.sort((a, b) => {
        const scoreA = (trendWeight[a.trend] || 0) + a.demand_score;
        const scoreB = (trendWeight[b.trend] || 0) + b.demand_score;
        return scoreB - scoreA;
      });
    } else if (tab === "growth") {
      // Fastest Growing: Sorted by demand_score descending
      filtered.sort((a, b) => b.demand_score - a.demand_score);
    } else if (tab === "intent") {
      // High Buyer Intent: Sorted by top opportunity score & buyer intent
      const intentWeight: Record<string, number> = {
        very_strong: 4,
        strong: 3,
        medium: 2,
        weak: 1,
      };
      filtered.sort((a, b) => {
        const oppScoreA = a.top_opportunity?.opportunity_score ?? 0;
        const oppScoreB = b.top_opportunity?.opportunity_score ?? 0;
        const weightA = (intentWeight[a.buyer_intent] || 0) * 25 + oppScoreA;
        const weightB = (intentWeight[b.buyer_intent] || 0) * 25 + oppScoreB;
        return weightB - weightA;
      });
    } else if (tab === "recent") {
      // Recently Discovered: Sorted by created_at descending
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return NextResponse.json({
      markets: filtered,
      total: filtered.length,
      stats: data.stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to retrieve markets: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
