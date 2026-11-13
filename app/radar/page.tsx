// app/radar/page.tsx — Market Radar Discovery Page.
// Specs: PRD §9, §22–§25, Phase 3.3.
// Synchronized 4-window temporal radar (7d, 30d, 90d, 12m) across YouTube & Reddit.

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadarContainer } from "@/components/radar/radar-container";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { loadStoredMarketTopics } from "@/lib/trends/load";
import { TrendingRadarService, thinRadarMessage } from "@/lib/trends/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market Radar & Trending Markets — PDF LAB",
  description:
    "Multi-window temporal radar detecting emerging, high-demand topics across YouTube comments and Reddit discussions with solvability gating.",
};

export default async function RadarPage() {
  // Stored markets + dated signals only. Nothing stored (or the DB unreachable) shows an honest empty state.
  let radar: TrendingRadarService | null = null;
  let loadError: string | null = null;
  let thinMessage = "";
  try {
    const topics = await loadStoredMarketTopics(createServiceSupabaseClient());
    thinMessage = thinRadarMessage(topics);
    radar = new TrendingRadarService(topics);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  // Thin data (every node would read "unknown") gets the empty state with the stored counts.
  const hasData = radar?.hasTrend() ?? false;
  const snapshots = hasData ? radar?.getFourWindowSnapshots() : undefined;
  const upcomingSeasonal = radar?.getUpcomingSeasonalSurges() ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Back navigation */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Back to Explorer
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/search">
              <Button variant="outline" size="sm" className="text-xs">
                Market Search
              </Button>
            </Link>
          </div>
        </div>

        {/* Master Radar Component */}
        {snapshots && hasData ? (
          <RadarContainer
            initialSnapshots={snapshots}
            upcomingSeasonal={upcomingSeasonal}
          />
        ) : (
          <section
            role="status"
            className="rounded-lg border border-dashed p-8 text-center space-y-2"
          >
            <h1 className="text-lg font-semibold">
              {loadError ? "Radar data could not be loaded" : "Not enough data for a radar yet"}
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {loadError
                ? `The stored signals could not be read (${loadError}). No sample data is shown.`
                : `${thinMessage} Run a research or an ingest, then come back.`}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
