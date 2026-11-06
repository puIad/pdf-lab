import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/pipeline";
import { getServiceDeps } from "@/lib/ingest/service-deps";
import { buildIdeas } from "@/lib/ideas/ideas";
import { DEFAULT_REGION, isRegion, scanSourceKeys } from "@/lib/ideas/seeds";
import { loadCompetitionChecks, normalizePhrase } from "@/lib/competition/check";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { autocompleteEnabled } from "@/lib/sources";
import type { MarketSignal } from "@/lib/sources/types";

// POST /api/ideas { seed, region? } — Phase 3 Parts 3.6 + 3.7 quick ideas.
// Phrases come from autocomplete while its local-only guard is open (DEC-008), otherwise (always in
// production) from Serper People-also-ask + related searches (DEC-010). Google Trends and Wikipedia
// run either way. Only the signals that were stored are scored: no stored evidence, no idea
// (06-EVIDENCE-CONTRACT). Open in local dev; in production it needs the internal key until Phase 5 auth.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // ~15 s suggestions + 2 throttled Trends calls

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const key = process.env.INTERNAL_API_KEY;
    if (!key || req.headers.get("x-api-key") !== key) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let seed: unknown;
  let region: unknown;
  try {
    const body = (await req.json()) as { seed?: unknown; region?: unknown } | null;
    seed = body?.seed;
    region = body?.region ?? DEFAULT_REGION;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof seed !== "string" || seed.trim().length < 2 || seed.trim().length > 80) {
    return NextResponse.json({ error: "seed must be a 2 to 80 character string" }, { status: 400 });
  }
  if (!isRegion(region)) {
    return NextResponse.json({ error: "region must be one of the listed country codes" }, { status: 400 });
  }
  const phraseSource = autocompleteEnabled() ? "autocomplete" : "web";

  try {
    const stored: MarketSignal[] = [];
    const summary = await runIngest({ query: seed.trim(), limit: 50, sourceKeys: scanSourceKeys(phraseSource), geo: region }, getServiceDeps(), (_key, signals) =>
      stored.push(...signals),
    );
    const ideas = buildIdeas(seed, stored);
    // Earlier competition checks (Part 3.9) are read from the DB; a scan never runs one.
    const checks = await loadCompetitionChecks(createServiceSupabaseClient(), ideas.ideas.map((i) => i.phrase));
    const competition = Object.fromEntries(ideas.ideas.flatMap((i) => (checks[normalizePhrase(i.phrase)] ? [[i.id, checks[normalizePhrase(i.phrase)]]] : [])));
    return NextResponse.json({
      ...ideas,
      competition,
      region,
      phraseSource,
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
