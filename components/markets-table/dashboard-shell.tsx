// components/markets-table/dashboard-shell.tsx — Dashboard Shell per PRD §40, §7.

"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Compass,
  Flame,
  TrendingUp,
  DollarSign,
  Layers,
  Sparkles,
  RotateCcw,
  SlidersHorizontal,
  X,
  FileCheck2,
  Database,
  LineChart,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ExplorerTable } from "./explorer-table";
import { DeepResearchDialog } from "./deep-research-dialog";
import type { MarketRowData, MarketStats, MarketTab } from "./types";

interface DashboardShellProps {
  initialMarkets: MarketRowData[];
  initialStats: MarketStats;
}

export function DashboardShell({
  initialMarkets,
  initialStats,
}: DashboardShellProps) {
  const [markets, setMarkets] = useState<MarketRowData[]>(initialMarkets);
  const [stats, setStats] = useState<MarketStats>(initialStats);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<MarketTab>("trending");
  const [trendFilter, setTrendFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const [pdfFitFilter, setPdfFitFilter] = useState("all");

  const [sortField, setSortField] = useState("demand_score");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Reset filters
  function handleResetFilters() {
    setSearchQuery("");
    setTrendFilter("all");
    setIntentFilter("all");
    setCompetitionFilter("all");
    setPdfFitFilter("all");
    setPage(1);
  }

  const isFiltered = Boolean(
    searchQuery.trim() ||
      trendFilter !== "all" ||
      intentFilter !== "all" ||
      competitionFilter !== "all" ||
      pdfFitFilter !== "all"
  );

  // Filter & Sort Logic
  const filteredAndSortedMarkets = useMemo(() => {
    let list = [...markets];

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => {
        const nameMatch = m.name.toLowerCase().includes(q);
        const descMatch = m.description?.toLowerCase().includes(q);
        const oppMatch = m.top_opportunity?.title.toLowerCase().includes(q);
        return nameMatch || descMatch || oppMatch;
      });
    }

    // 2. Trend Filter
    if (trendFilter !== "all") {
      list = list.filter((m) => m.trend === trendFilter);
    }

    // 3. Buyer Intent Filter
    if (intentFilter !== "all") {
      list = list.filter((m) => m.buyer_intent === intentFilter);
    }

    // 4. Competition Filter
    if (competitionFilter !== "all") {
      if (competitionFilter === "low") {
        list = list.filter((m) => m.competition_score < 30);
      } else if (competitionFilter === "moderate") {
        list = list.filter((m) => m.competition_score >= 30 && m.competition_score <= 70);
      } else if (competitionFilter === "high") {
        list = list.filter((m) => m.competition_score > 70);
      }
    }

    // 5. PDF Fit Filter
    if (pdfFitFilter !== "all") {
      if (pdfFitFilter === "high") {
        list = list.filter((m) => m.pdf_fit_score >= 60);
      } else if (pdfFitFilter === "moderate") {
        list = list.filter((m) => m.pdf_fit_score >= 40 && m.pdf_fit_score < 60);
      } else if (pdfFitFilter === "low") {
        list = list.filter((m) => m.pdf_fit_score < 40);
      }
    }

    // 6. Tab Ordering Rules per PRD §40
    if (activeTab === "trending") {
      const trendWeight: Record<string, number> = {
        accelerating: 400,
        emerging: 300,
        seasonal: 200,
        stable: 100,
        unknown: 50,
        declining: 0,
      };
      list.sort((a, b) => {
        const scoreA = (trendWeight[a.trend] || 0) + a.demand_score;
        const scoreB = (trendWeight[b.trend] || 0) + b.demand_score;
        return scoreB - scoreA;
      });
    } else if (activeTab === "growth") {
      list.sort((a, b) => b.demand_score - a.demand_score);
    } else if (activeTab === "intent") {
      const intentWeight: Record<string, number> = {
        very_strong: 4,
        strong: 3,
        medium: 2,
        weak: 1,
      };
      list.sort((a, b) => {
        const oppScoreA = a.top_opportunity?.opportunity_score ?? 0;
        const oppScoreB = b.top_opportunity?.opportunity_score ?? 0;
        const weightA = (intentWeight[a.buyer_intent] || 0) * 25 + oppScoreA;
        const weightB = (intentWeight[b.buyer_intent] || 0) * 25 + oppScoreB;
        return weightB - weightA;
      });
    } else if (activeTab === "recent") {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    // 7. Explicit User Column Sort (if user clicked headers)
    if (sortField) {
      list.sort((a, b) => {
        let valA: number | string = 0;
        let valB: number | string = 0;

        if (sortField === "name") {
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortOrder === "asc"
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        } else if (sortField === "demand_score") {
          valA = a.demand_score;
          valB = b.demand_score;
        } else if (sortField === "trend") {
          valA = a.trend;
          valB = b.trend;
        } else if (sortField === "competition_score") {
          valA = a.competition_score;
          valB = b.competition_score;
        } else if (sortField === "opportunity_score") {
          valA = a.top_opportunity?.opportunity_score ?? 0;
          valB = b.top_opportunity?.opportunity_score ?? 0;
        }

        if (typeof valA === "number" && typeof valB === "number") {
          return sortOrder === "asc" ? valA - valB : valB - valA;
        }
        return 0;
      });
    }

    return list;
  }, [
    markets,
    searchQuery,
    trendFilter,
    intentFilter,
    competitionFilter,
    pdfFitFilter,
    activeTab,
    sortField,
    sortOrder,
  ]);

  // Paginated slice
  const paginatedMarkets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedMarkets.slice(start, start + pageSize);
  }, [filteredAndSortedMarkets, page, pageSize]);

  // Handle Sort Change
  function handleSortChange(field: string) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setPage(1);
  }

  // Reload data from API after deep research
  async function refreshMarkets() {
    try {
      const res = await fetch("/api/markets");
      if (res.ok) {
        const data = await res.json();
        setMarkets(data.markets || []);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // Fallback
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* 1. Header & Branding */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center size-9 rounded-xl bg-primary text-primary-foreground font-bold shadow-xs">
              P
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              PDF LAB
            </h1>
            <Badge variant="outline" className="text-xs font-mono py-0 px-2 text-muted-foreground">
              Market Explorer
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Evidence-backed digital product intelligence. Continuously evaluate niches, demand velocity, competition density, and PDF suitability with zero hallucination.
          </p>
        </div>

        {/* Top CTAs: Market Search, Market Radar & Run Deep Research */}
        <div className="flex items-center gap-2.5">
          <Link href="/radar">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer border-primary/40 hover:border-primary">
              <Compass className="size-4 text-primary" />
              <span>Market Radar</span>
            </Button>
          </Link>
          <Link href="/search">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
              <Search className="size-4" />
              <span>Market Search</span>
            </Button>
          </Link>
          <DeepResearchDialog onSuccess={refreshMarkets} />
        </div>
      </div>

      {/* 2. Stat Summary Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Markets Tracked</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                {stats.totalMarkets}
              </p>
            </div>
            <Database className="size-5 text-muted-foreground/60" />
          </CardContent>
        </Card>

        <Card className="shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Evidence Grounded</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                {stats.totalEvidence}
              </p>
            </div>
            <FileCheck2 className="size-5 text-emerald-600 dark:text-emerald-400" />
          </CardContent>
        </Card>

        <Card className="shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Opportunities</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                {stats.totalOpportunities}
              </p>
            </div>
            <Sparkles className="size-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Market Signals</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                {stats.totalSignals}
              </p>
            </div>
            <LineChart className="size-5 text-amber-600 dark:text-amber-400" />
          </CardContent>
        </Card>
      </div>

      {/* 3. Search Bar per PRD §40 */}
      <div className="relative w-full">
        <div className="relative flex items-center">
          <Search className="absolute left-4 size-5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search a market by niche, audience, problem, or keywords..."
            className="w-full h-12 pl-12 pr-10 text-base rounded-xl bg-card border-border shadow-xs focus-visible:ring-2 focus-visible:ring-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
              <span className="sr-only">Clear search</span>
            </button>
          )}
        </div>

        {searchQuery.trim() && (
          <div className="flex items-center justify-between text-xs px-2 pt-1.5 text-muted-foreground">
            <span>Filtering table ({filteredAndSortedMarkets.length} results)</span>
            <Link
              href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View full PRD §8 overview for &ldquo;{searchQuery.trim()}&rdquo;</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>
        )}
      </div>

      {/* 4. Four Filter Tabs per PRD §40 */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {[
              { id: "trending", label: "Trending Markets", icon: <Flame className="size-4 text-amber-500" /> },
              { id: "growth", label: "Fastest Growing", icon: <TrendingUp className="size-4 text-emerald-500" /> },
              { id: "intent", label: "High Buyer Intent", icon: <DollarSign className="size-4 text-primary" /> },
              { id: "recent", label: "Recently Discovered", icon: <Layers className="size-4 text-purple-500" /> },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id as MarketTab);
                    setPage(1);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-foreground text-background shadow-xs font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground font-mono">
            Showing {filteredAndSortedMarkets.length} of {markets.length} observed markets
          </div>
        </div>

        {/* 5. Filter Dropdowns Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            <span>Filters:</span>
          </div>

          {/* Trend Select */}
          <NativeSelect
            size="sm"
            value={trendFilter}
            onChange={(e) => {
              setTrendFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by trend"
          >
            <NativeSelectOption value="all">All Trends</NativeSelectOption>
            <NativeSelectOption value="accelerating">📈 Accelerating</NativeSelectOption>
            <NativeSelectOption value="emerging">🔥 Emerging</NativeSelectOption>
            <NativeSelectOption value="seasonal">🔄 Seasonal</NativeSelectOption>
            <NativeSelectOption value="stable">⚖️ Stable</NativeSelectOption>
            <NativeSelectOption value="declining">📉 Declining</NativeSelectOption>
          </NativeSelect>

          {/* Intent Select */}
          <NativeSelect
            size="sm"
            value={intentFilter}
            onChange={(e) => {
              setIntentFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by buyer intent"
          >
            <NativeSelectOption value="all">All Buyer Intent</NativeSelectOption>
            <NativeSelectOption value="very_strong">💰 Very Strong Intent</NativeSelectOption>
            <NativeSelectOption value="strong">Strong Intent</NativeSelectOption>
            <NativeSelectOption value="medium">Medium Intent</NativeSelectOption>
            <NativeSelectOption value="weak">Weak Intent</NativeSelectOption>
          </NativeSelect>

          {/* Competition Select */}
          <NativeSelect
            size="sm"
            value={competitionFilter}
            onChange={(e) => {
              setCompetitionFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by competition density"
          >
            <NativeSelectOption value="all">All Competition</NativeSelectOption>
            <NativeSelectOption value="low">🟢 Low Density (&lt;30)</NativeSelectOption>
            <NativeSelectOption value="moderate">🟡 Moderate (30–70)</NativeSelectOption>
            <NativeSelectOption value="high">🔴 High Density (&gt;70)</NativeSelectOption>
          </NativeSelect>

          {/* PDF Fit Select */}
          <NativeSelect
            size="sm"
            value={pdfFitFilter}
            onChange={(e) => {
              setPdfFitFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by PDF fit"
          >
            <NativeSelectOption value="all">All PDF Fit</NativeSelectOption>
            <NativeSelectOption value="high">High PDF Fit (&ge;60)</NativeSelectOption>
            <NativeSelectOption value="moderate">Moderate Fit (40–59)</NativeSelectOption>
            <NativeSelectOption value="low">Low Fit (&lt;40)</NativeSelectOption>
          </NativeSelect>

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
            >
              <RotateCcw className="size-3" />
              <span>Reset filters</span>
            </Button>
          )}
        </div>
      </div>

      {/* 6. Explorer Table */}
      <ExplorerTable
        markets={paginatedMarkets}
        page={page}
        pageSize={pageSize}
        totalCount={filteredAndSortedMarkets.length}
        onPageChange={setPage}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        onResetFilters={handleResetFilters}
        isFiltered={isFiltered}
      />
    </div>
  );
}
