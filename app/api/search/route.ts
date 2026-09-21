// app/api/search/route.ts — Phase 3 Part 3.2 Market Search & Overview API.
// Implements free-text niche/audience search returning PRD §8 overview with evidence citations
// and persists searches into research_runs (mode explore/validate) for history.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { generateMarketOverview, getSearchHistory } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const modeParam = searchParams.get("mode");
  const userId = searchParams.get("user_id");
  const isHistoryRequest = searchParams.get("history") === "true";

  const supabase = createServiceSupabaseClient();

  // If client only requested history
  if (isHistoryRequest && !q) {
    try {
      const history = await getSearchHistory(supabase, {
        userId: userId || undefined,
        limit: 20,
      });
      return NextResponse.json({ history });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to fetch search history: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // Validate search query
  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required for market search" },
      { status: 400 }
    );
  }

  const mode = modeParam === "validate" ? "validate" : "explore";

  try {
    const overview = await generateMarketOverview(q.trim(), supabase, {
      userId: userId || undefined,
      mode,
      persistRun: true,
    });

    const history = await getSearchHistory(supabase, {
      userId: userId || undefined,
      limit: 10,
    });

    return NextResponse.json({
      overview,
      runId: overview.runId,
      history,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Market search failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let body: { query?: unknown; mode?: unknown; userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'query' must be a non-empty string" },
      { status: 400 }
    );
  }

  const mode = body.mode === "validate" ? "validate" : "explore";
  const userId = typeof body.userId === "string" ? body.userId : undefined;
  const supabase = createServiceSupabaseClient();

  try {
    const overview = await generateMarketOverview(body.query.trim(), supabase, {
      userId,
      mode,
      persistRun: true,
    });

    return NextResponse.json({
      overview,
      runId: overview.runId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Market search failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
