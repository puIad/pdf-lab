// app/page.tsx — Market Explorer homepage (DB-backed) per PRD §7, §40.
// Renders the dashboard shell, evidence-derived explorer table, and filter tabs.

import React from "react";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { fetchMarketsData, parseMarketScope } from "@/lib/markets/fetcher";
import { DashboardShell } from "@/components/markets-table";

export const dynamic = "force-dynamic";

export default async function HomePage(props: { searchParams: Promise<{ run?: string }> }) {
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

  try {
    const res = await fetchMarketsData(supabase, scope);
    markets = res.markets;
    stats = res.stats;
    runs = res.runs;
    legacyCount = res.legacyCount;
  } catch (err) {
    console.error("Failed to load initial markets from DB:", err);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardShell key={scope} initialMarkets={markets} initialStats={stats} runs={runs} scope={scope} legacyCount={legacyCount} />
    </main>
  );
}
