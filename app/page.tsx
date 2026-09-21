// app/page.tsx — Market Explorer homepage (DB-backed) per PRD §7, §40.
// Renders the dashboard shell, evidence-derived explorer table, and filter tabs.

import React from "react";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { fetchMarketsData } from "@/lib/markets/fetcher";
import { DashboardShell } from "@/components/markets-table";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createServiceSupabaseClient();
  let markets: Awaited<ReturnType<typeof fetchMarketsData>>["markets"] = [];
  let stats: Awaited<ReturnType<typeof fetchMarketsData>>["stats"] = {
    totalMarkets: 0,
    totalEvidence: 0,
    totalOpportunities: 0,
    totalSignals: 0,
  };

  try {
    const res = await fetchMarketsData(supabase);
    markets = res.markets;
    stats = res.stats;
  } catch (err) {
    console.error("Failed to load initial markets from DB:", err);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardShell initialMarkets={markets} initialStats={stats} />
    </main>
  );
}
