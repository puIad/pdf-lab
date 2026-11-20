// app/markets/page.tsx — Market Explorer (DB-backed) per PRD §7, §40. It was the home page until
// Part 6.12 made the ideas scan the home; `/?run=` links redirect here.
// Renders the dashboard shell, evidence-derived explorer table, and filter tabs.

import React from "react";
import { headers } from "next/headers";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";
import { fetchMarketsData, parseMarketScope } from "@/lib/markets/fetcher";
import type { NicheTrend } from "@/lib/trends/niche";
import { DashboardShell } from "@/components/markets-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Markets — PDF LAB",
  description: "Markets found by Deep runs, with the evidence count behind every score.",
};

export default async function MarketsPage(props: { searchParams: Promise<{ run?: string }> }) {
  // Latest completed run of each seed by default; `?run=<id>` or `?run=legacy` reaches the rest (Part 6.7).
  const scope = parseMarketScope((await props.searchParams).run, "latest");
  const supabase = createServiceSupabaseClient();
  let markets: Awaited<ReturnType<typeof fetchMarketsData>>["markets"] = [];
  let stats: Awaited<ReturnType<typeof fetchMarketsData>>["stats"] = {
    totalMarkets: 0,
    totalEvidence: 0,
    totalOpportunities: 0,
    totalSignals: 0,
  };

  let runs: Awaited<ReturnType<typeof fetchMarketsData>>["runs"] = [];
  let legacyCount = 0;
  let nicheTrends: NicheTrend[] = [];

  try {
    // The run picker lists the viewer's own runs only (issue #39).
    const res = await fetchMarketsData(supabase, scope, await resolveCaller(await headers()));
    markets = res.markets;
    stats = res.stats;
    runs = res.runs;
    legacyCount = res.legacyCount;
    nicheTrends = res.nicheTrends ?? [];
  } catch (err) {
    console.error("Failed to load initial markets from DB:", err);
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <DashboardShell key={scope} initialMarkets={markets} initialStats={stats} runs={runs} scope={scope} legacyCount={legacyCount} nicheTrends={nicheTrends} />
    </main>
  );
}
