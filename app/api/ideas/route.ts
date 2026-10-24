import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/pipeline";
import { getServiceDeps } from "@/lib/ingest/service-deps";
import { buildIdeas } from "@/lib/ideas/ideas";
import type { MarketSignal } from "@/lib/sources/types";

// POST /api/ideas { seed } — Phase 3 Part 3.6 quick ideas.
// Ingests the seed through autocomplete (local-only, DEC-008), Google Trends and Wikipedia,
// then scores only the signals that were stored: no stored evidence, no idea (06-EVIDENCE-CONTRACT).
// Open in local dev; in production it needs the internal key until Phase 5 auth.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // ~15 s suggestions + 2 throttled Trends calls

const IDEA_SOURCES = ["autocomplete", "gtrends", "wikipedia"];

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const key = process.env.INTERNAL_API_KEY;
    if (!key || req.headers.get("x-api-key") !== key) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let seed: unknown;
  try {
    seed = ((await req.json()) as { seed?: unknown } | null)?.seed;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof seed !== "string" || seed.trim().length < 2 || seed.trim().length > 80) {
    return NextResponse.json({ error: "seed must be a 2 to 80 character string" }, { status: 400 });
  }

  try {
    const stored: MarketSignal[] = [];
    const summary = await runIngest({ query: seed.trim(), limit: 50, sourceKeys: IDEA_SOURCES }, getServiceDeps(), (_key, signals) =>
      stored.push(...signals),
    );
    return NextResponse.json({
      ...buildIdeas(seed, stored),
      sources: summary.sources.map(({ key, displayName, status, collected, inserted, duplicates, error }) => ({
        key,
        displayName,
        status,
        collected,
        inserted,
        duplicates,
        error,
      })),
      scannedAt: summary.ingestedAt,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
