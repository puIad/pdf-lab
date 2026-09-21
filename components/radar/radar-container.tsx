// components/radar/radar-container.tsx — Master Synchronized 4-Window Market Radar.
// Coordinates 7d, 30d, 90d, and 12m radar windows with synchronized hover, tooltips, and filtering.

"use client";

import * as React from "react";
import { Compass, Flame, TrendingUp, Calendar, Layers } from "lucide-react";
import { RadarWindow } from "./radar-window.tsx";
import { RadarFilterBar } from "./radar-filter-bar.tsx";
import { RadarNodeTooltip } from "./radar-node-tooltip.tsx";
import { SeasonalSurgePanel } from "./seasonal-surge-panel.tsx";
import type {
  RadarFilterOptions,
  RadarNode,
  RadarSnapshot,
  SeasonalSurgeForecast,
  TimeWindow,
} from "@/lib/trends/types";

interface RadarContainerProps {
  initialSnapshots: Record<TimeWindow, RadarSnapshot>;
  upcomingSeasonal?: SeasonalSurgeForecast[];
}

export function RadarContainer({
  initialSnapshots,
  upcomingSeasonal = [],
}: RadarContainerProps) {
  const [snapshots, setSnapshots] = React.useState(initialSnapshots);
  const [filters, setFilters] = React.useState<RadarFilterOptions>({
    source: "all",
    category: "all",
    minConfidence: 0,
    solvableOnly: false,
    search: "",
  });

  const [hoveredNode, setHoveredNode] = React.useState<RadarNode | null>(null);
  const [activeWindow, setActiveWindow] = React.useState<TimeWindow>("7d");
  const [selectedNode, setSelectedNode] = React.useState<RadarNode | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Client-side refetch on filter change
  const fetchFilteredSnapshots = React.useCallback(async (newFilters: RadarFilterOptions) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("window", "all");
      if (newFilters.source && newFilters.source !== "all") params.set("source", newFilters.source);
      if (newFilters.category && newFilters.category !== "all") params.set("category", newFilters.category);
      if (newFilters.minConfidence) params.set("minConfidence", String(newFilters.minConfidence));
      if (newFilters.solvableOnly) params.set("solvableOnly", "true");
      if (newFilters.search) params.set("search", newFilters.search);

      const res = await fetch(`/api/radar?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { snapshots: Record<TimeWindow, RadarSnapshot> };
        if (data.snapshots) {
          setSnapshots(data.snapshots);
        }
      }
    } catch {
      // Fallback stays on current snapshots
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFilterChange = (newFilters: RadarFilterOptions) => {
    setFilters(newFilters);
    fetchFilteredSnapshots(newFilters);
  };

  const handleHover = (node: RadarNode | null, windowType: TimeWindow) => {
    setHoveredNode(node);
    if (node) {
      setActiveWindow(windowType);
    }
  };

  const currentSummary = snapshots["7d"]?.summary || {
    totalTopics: 0,
    emergingCount: 0,
    acceleratingCount: 0,
    seasonalCount: 0,
    solvableCount: 0,
    avgMomentum: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Overview Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
            <Compass className="size-6 text-primary" />
            Market Radar & Trending Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Synchronized 4-window temporal radar across YouTube comments and Reddit discussions (PRD §22–§25)
          </p>
        </div>

        {/* Global Summary KPI Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
            <Flame className="size-3.5" />
            <span>{currentSummary.emergingCount} Emerging</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400 font-medium">
            <TrendingUp className="size-3.5" />
            <span>{currentSummary.acceleratingCount} Accelerating</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-medium">
            <Calendar className="size-3.5" />
            <span>{currentSummary.seasonalCount} Seasonal</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border text-foreground font-mono">
            <Layers className="size-3.5 text-primary" />
            <span>Avg Momentum: {currentSummary.avgMomentum}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar Controls */}
      <RadarFilterBar
        filters={filters}
        onChangeFilters={handleFilterChange}
        totalTopics={currentSummary.totalTopics}
        solvableTopicsCount={currentSummary.solvableCount}
      />

      {/* Synchronized 4-Window Radar Grid */}
      <div className={`relative grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
        {/* Window 1: 7-Day Velocity Burst */}
        <RadarWindow
          windowType="7d"
          title="7-Day Velocity Burst"
          subtitle="Emerging breakouts & viral discussion surges (WoW Delta)"
          nodes={snapshots["7d"]?.nodes || []}
          hoveredMarketId={hoveredNode?.analysis.marketId || null}
          onHoverNode={(node) => handleHover(node, "7d")}
          onSelectNode={(node) => setSelectedNode(node)}
        />

        {/* Window 2: 30-Day Growth Engine */}
        <RadarWindow
          windowType="30d"
          title="30-Day Growth Engine"
          subtitle="Sustained demand & month-over-month acceleration (MoM Delta)"
          nodes={snapshots["30d"]?.nodes || []}
          hoveredMarketId={hoveredNode?.analysis.marketId || null}
          onHoverNode={(node) => handleHover(node, "30d")}
          onSelectNode={(node) => setSelectedNode(node)}
        />

        {/* Window 3: 90-Day Quarterly Trend */}
        <RadarWindow
          windowType="90d"
          title="90-Day Quarterly Trend"
          subtitle="Mid-term commercial momentum & category establishment"
          nodes={snapshots["90d"]?.nodes || []}
          hoveredMarketId={hoveredNode?.analysis.marketId || null}
          onHoverNode={(node) => handleHover(node, "90d")}
          onSelectNode={(node) => setSelectedNode(node)}
        />

        {/* Window 4: 12-Month Macro Baseline */}
        <RadarWindow
          windowType="12m"
          title="12-Month Baseline & Seasonality"
          subtitle="Historical secular trend vs annual calendar cycle"
          nodes={snapshots["12m"]?.nodes || []}
          hoveredMarketId={hoveredNode?.analysis.marketId || null}
          onHoverNode={(node) => handleHover(node, "12m")}
          onSelectNode={(node) => setSelectedNode(node)}
        />

        {/* Coordinated Floating Tooltip on Active Hover / Click */}
        {(hoveredNode || selectedNode) && (
          <div className="fixed bottom-6 right-6 z-50 pointer-events-auto">
            <RadarNodeTooltip
              node={hoveredNode || selectedNode!}
              activeWindow={activeWindow}
              onClose={() => {
                setHoveredNode(null);
                setSelectedNode(null);
              }}
            />
          </div>
        )}
      </div>

      {/* PRD §24 Seasonal Surge Intelligence Forecasts */}
      <SeasonalSurgePanel forecasts={upcomingSeasonal} />
    </div>
  );
}
