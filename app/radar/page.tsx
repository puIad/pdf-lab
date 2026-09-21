// app/radar/page.tsx — Market Radar Discovery Page.
// Specs: PRD §9, §22–§25, Phase 3.3.
// Synchronized 4-window temporal radar (7d, 30d, 90d, 12m) across YouTube & Reddit.

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadarContainer } from "@/components/radar/radar-container";
import { trendingRadarService } from "@/lib/trends/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market Radar & Trending Markets — PDF LAB",
  description:
    "Multi-window temporal radar detecting emerging, high-demand topics across YouTube comments and Reddit discussions with solvability gating.",
};

export default function RadarPage() {
  // Load initial 4-window snapshots & seasonal surges server-side
  const snapshots = trendingRadarService.getFourWindowSnapshots();
  const upcomingSeasonal = trendingRadarService.getUpcomingSeasonalSurges();

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
        <RadarContainer
          initialSnapshots={snapshots}
          upcomingSeasonal={upcomingSeasonal}
        />
      </div>
    </main>
  );
}
