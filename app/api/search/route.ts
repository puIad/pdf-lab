// app/api/search/route.ts — Phase 3 Part 3.2 Market Search & Overview API.
// Implements free-text niche/audience search returning PRD §8 overview with evidence citations
// and persists searches into research_runs (mode explore/validate) for history.
// Part 5.1: a search is counted against the caller's plan, and history is the caller's own.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { generateMarketOverview, getSearchHistory } from "@/lib/search";
import { enforceQuota, resolveCaller } from "@/lib/quotas/guard";
import type { Caller } from "@/lib/quotas/quotas";

export const dynamic = "force-dynamic";

/** A person sees their own searches; the server key and a dev server see all; signed out sees none. */
function historyFor(caller: Caller, limit: number) {
  if (caller.plan === "anon") return Promise.resolve([]);
  return getSearchHistory(createServiceSupabaseClient(), { userId: caller.userId ?? undefined, limit });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const modeParam = searchParams.get("mode");
  const isHistoryRequest = searchParams.get("history") === "true";

  // If client only requested history
  if (isHistoryRequest && !q) {
    try {
      return NextResponse.json({ history: await historyFor(await resolveCaller(req.headers), 20) });
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
  const guard = await enforceQuota(req.headers, "search");
  if (guard.denied) return guard.denied;

  try {
    const overview = await generateMarketOverview(q.trim(), createServiceSupabaseClient(), {
      userId: guard.caller.userId ?? undefined,
      mode,
      persistRun: true,
    });

    return NextResponse.json({
      overview,
      runId: overview.runId,
      history: await historyFor(guard.caller, 10),
      quota: guard.quota,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Market search failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let body: { query?: unknown; mode?: unknown };
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
  const guard = await enforceQuota(req.headers, "search");
  if (guard.denied) return guard.denied;

  try {
    const overview = await generateMarketOverview(body.query.trim(), createServiceSupabaseClient(), {
      userId: guard.caller.userId ?? undefined,
      mode,
      persistRun: true,
    });

    return NextResponse.json({
      overview,
      runId: overview.runId,
      quota: guard.quota,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Market search failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
