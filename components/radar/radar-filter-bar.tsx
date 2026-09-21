// components/radar/radar-filter-bar.tsx — Multi-Source & Solvability Filter Controls.
// Supports filtering by YouTube/Reddit source, Category, Confidence threshold, and PDF Solvability.

"use client";

import { Search, SlidersHorizontal, CheckSquare, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { RadarFilterOptions } from "@/lib/trends/types";

function YouTubeIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

interface RadarFilterBarProps {
  filters: RadarFilterOptions;
  onChangeFilters: (newFilters: RadarFilterOptions) => void;
  totalTopics: number;
  solvableTopicsCount: number;
}

export function RadarFilterBar({
  filters,
  onChangeFilters,
  totalTopics,
  solvableTopicsCount,
}: RadarFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/70 p-4 backdrop-blur-xs">
      {/* Top Filter Row: Search & Source Tabs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter trending topics (e.g. LLM, BIOS, DaVinci, Tax)..."
            value={filters.search || ""}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
            className="pl-9 text-xs"
          />
        </div>

        {/* Source Filter Switcher */}
        <div className="flex items-center rounded-lg border border-border/70 p-0.5 bg-muted/40 text-xs">
          <Button
            variant={!filters.source || filters.source === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => onChangeFilters({ ...filters, source: "all" })}
            className="h-7 text-xs px-3"
          >
            All Sources
          </Button>
          <Button
            variant={filters.source === "youtube" ? "default" : "ghost"}
            size="sm"
            onClick={() => onChangeFilters({ ...filters, source: "youtube" })}
            className="h-7 text-xs px-3 gap-1.5"
          >
            <YouTubeIcon className="size-3.5 text-red-500" />
            YouTube
          </Button>
          <Button
            variant={filters.source === "reddit" ? "default" : "ghost"}
            size="sm"
            onClick={() => onChangeFilters({ ...filters, source: "reddit" })}
            className="h-7 text-xs px-3 gap-1"
          >
            <span className="text-orange-500 font-bold font-mono">r/</span>
            Reddit
          </Button>
        </div>
      </div>

      {/* Bottom Filter Row: Category, Confidence, Solvability Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Category:</span>
            <NativeSelect
              value={filters.category || "all"}
              onChange={(e) => onChangeFilters({ ...filters, category: e.target.value })}
              className="h-8 text-xs w-36"
            >
              <option value="all">All Categories</option>
              <option value="tech">Tech & AI</option>
              <option value="creator">Creator & Media</option>
              <option value="finance">Finance & Tax</option>
              <option value="productivity">Productivity</option>
              <option value="lifestyle">Lifestyle & Craft</option>
            </NativeSelect>
          </div>

          {/* Min Confidence Threshold */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Min Confidence:</span>
            <NativeSelect
              value={filters.minConfidence !== undefined ? String(filters.minConfidence) : "0"}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  minConfidence: parseFloat(e.target.value),
                })
              }
              className="h-8 text-xs w-28"
            >
              <option value="0">Any (0%+)</option>
              <option value="0.4">Moderate (40%+)</option>
              <option value="0.6">High (60%+)</option>
              <option value="0.75">Strong (75%+)</option>
            </NativeSelect>
          </div>

          {/* Solvable Only Toggle */}
          <button
            type="button"
            onClick={() => onChangeFilters({ ...filters, solvableOnly: !filters.solvableOnly })}
            className="inline-flex items-center gap-1.5 cursor-pointer text-foreground hover:text-primary transition-colors select-none font-medium ml-1"
          >
            {filters.solvableOnly ? (
              <CheckSquare className="size-4 text-primary" />
            ) : (
              <Square className="size-4 text-muted-foreground" />
            )}
            <span>Solvable Only (PDF Fit &ge; 65%)</span>
          </button>
        </div>

        {/* Counts summary indicator */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <SlidersHorizontal className="size-3.5" />
          <span>
            Showing <strong className="text-foreground">{totalTopics}</strong> topics
            {filters.solvableOnly && ` (${solvableTopicsCount} verified solvable)`}
          </span>
        </div>
      </div>
    </div>
  );
}
