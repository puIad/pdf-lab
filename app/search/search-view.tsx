// app/search/search-view.tsx — Client component for Market Search and PRD §8 Overview.
// Displays the 9 dimensions: size proxy, search interest, trend direction, discussion counts,
// buyer-intent signals, marketplace activity, competitive density, pains, underserved submarkets.
// Every line either cites evidence or explicitly states "Not observed".

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowLeft,
  ExternalLink,
  TrendingUp,
  BarChart3,
  Users,
  ShoppingBag,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Clock,
  Quote,
  CheckCircle2,
  XCircle,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeepResearchDialog } from "@/components/markets-table/deep-research-dialog";
import type {
  MarketOverview,
  SearchHistoryItem,
  EvidenceCitation,
} from "@/lib/search/types";

interface SearchViewProps {
  initialQuery: string;
  initialMode: "explore" | "validate";
  initialOverview: MarketOverview | null;
  initialHistory: SearchHistoryItem[];
}

export function SearchView({
  initialQuery,
  initialMode,
  initialOverview,
  initialHistory,
}: SearchViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<"explore" | "validate">(initialMode);
  const [overview, setOverview] = useState<MarketOverview | null>(initialOverview);
  const [history, setHistory] = useState<SearchHistoryItem[]>(initialHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(searchQ = query, searchMode = mode) {
    const trimmed = searchQ.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode}`
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Search failed with status ${res.status}`);
      }

      const data = await res.json();
      setOverview(data.overview);
      if (data.history) {
        setHistory(data.history);
      }
      // Update URL query params without full reload
      router.push(`/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode}`, {
        scroll: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* 1. Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer">
              <ArrowLeft className="size-4" />
              <span>Back to Explorer</span>
            </Button>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Market Search & Overview
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              PRD §8
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DeepResearchDialog onSuccess={() => handleSearch()} />
        </div>
      </div>

      {/* 2. Search Input & Mode Selector */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search niche, audience, or problem (e.g. pc troubleshooting, students, cybersecurity)..."
              className="w-full h-12 pl-12 pr-4 text-base rounded-xl bg-card border-border shadow-xs focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-muted p-1 border border-border">
              <button
                type="button"
                onClick={() => setMode("explore")}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  mode === "explore"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Explore Mode
              </button>
              <button
                type="button"
                onClick={() => setMode("validate")}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  mode === "validate"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Validate Concept
              </button>
            </div>

            <Button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="h-12 px-6 rounded-xl font-medium cursor-pointer"
            >
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        {/* Search History Chips */}
        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium">
              <Clock className="size-3" /> Recent Searches:
            </span>
            {history.slice(0, 6).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setQuery(item.query);
                  const newMode = item.mode === "validate" ? "validate" : "explore";
                  setMode(newMode);
                  handleSearch(item.query, newMode);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary/60 hover:bg-secondary text-secondary-foreground transition-colors cursor-pointer"
              >
                <span>{item.query}</span>
                <span className="text-[10px] opacity-60">({item.mode})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* 3. Market Overview Results per PRD §8 */}
      {overview && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Query Summary & Confidence Banner */}
          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                      &ldquo;{overview.query}&rdquo;
                    </h2>
                    <Badge variant="secondary" className="capitalize text-xs font-mono">
                      {overview.mode} Mode
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    PRD §8 Market Overview &bull; Evaluated {new Date(overview.searchedAt).toLocaleDateString()} &bull;
                    {" "}{overview.matchedMarketsCount} markets &bull; {overview.matchedSignalsCount} signals observed
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block font-medium">
                      Evidence Confidence
                    </span>
                    <span className="text-lg font-bold font-mono text-foreground">
                      {Math.round(overview.confidence * 100)}%
                    </span>
                  </div>
                  <Badge
                    variant={
                      overview.confidence >= 0.7
                        ? "default"
                        : overview.confidence >= 0.35
                        ? "secondary"
                        : "outline"
                    }
                    className="h-8 px-3 text-xs uppercase tracking-wider"
                  >
                    {overview.confidence >= 0.7
                      ? "High Confidence"
                      : overview.confidence >= 0.35
                      ? "Moderate"
                      : overview.confidence > 0
                      ? "Low / Thin"
                      : "Unobserved"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 9 PRD §8 Dimension Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. Size Proxy */}
            <DimensionCard
              title="1. Size Proxy"
              icon={<Users className="size-4 text-blue-500" />}
              observed={overview.sizeProxy.observed}
              rawLabel={overview.sizeProxy.rawLabel}
              note={overview.sizeProxy.note}
              evidence={overview.sizeProxy.evidence}
            >
              {overview.sizeProxy.value && (
                <div className="space-y-2 mt-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-muted/60">
                      <span className="text-muted-foreground block">Observed Signals</span>
                      <span className="font-mono font-bold text-sm">
                        {overview.sizeProxy.value.totalSignals}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/60">
                      <span className="text-muted-foreground block">Unique Sources</span>
                      <span className="font-mono font-bold text-sm">
                        {overview.sizeProxy.value.uniqueSources}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {overview.sizeProxy.value.estimatedReach}
                  </p>
                </div>
              )}
            </DimensionCard>

            {/* 2. Search Interest */}
            <DimensionCard
              title="2. Search Interest"
              icon={<BarChart3 className="size-4 text-emerald-500" />}
              observed={overview.searchInterest.observed}
              rawLabel={overview.searchInterest.rawLabel}
              note={overview.searchInterest.note}
              evidence={overview.searchInterest.evidence}
            >
              {overview.searchInterest.value && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Trend Velocity:</span>
                    <Badge variant="outline" className="font-mono capitalize">
                      {overview.searchInterest.value.direction}
                    </Badge>
                  </div>
                  {overview.searchInterest.value.risingQueries.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium block">
                        Rising Search Queries:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {overview.searchInterest.value.risingQueries.map((rq, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] py-0 px-1.5">
                            {rq}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DimensionCard>

            {/* 3. Trend Direction */}
            <DimensionCard
              title="3. Trend Direction"
              icon={<TrendingUp className="size-4 text-amber-500" />}
              observed={overview.trendDirection.observed}
              rawLabel={overview.trendDirection.rawLabel}
              note={overview.trendDirection.note}
              evidence={overview.trendDirection.evidence}
            >
              {overview.trendDirection.value && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`text-xs font-mono uppercase ${
                        overview.trendDirection.value.direction === "accelerating"
                          ? "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
                          : overview.trendDirection.value.direction === "emerging"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                          : overview.trendDirection.value.direction === "stable"
                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {overview.trendDirection.value.direction}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ({overview.trendDirection.value.timeWindowsEvaluated} windows)
                    </span>
                  </div>
                  {overview.trendDirection.value.deltas && (
                    <p className="text-xs text-muted-foreground">
                      {overview.trendDirection.value.deltas}
                    </p>
                  )}
                </div>
              )}
            </DimensionCard>

            {/* 4. Discussion Counts */}
            <DimensionCard
              title="4. Discussion Counts"
              icon={<Users className="size-4 text-indigo-500" />}
              observed={overview.discussionCounts.observed}
              rawLabel={overview.discussionCounts.rawLabel}
              note={overview.discussionCounts.note}
              evidence={overview.discussionCounts.evidence}
            >
              {overview.discussionCounts.value && (
                <div className="space-y-2 mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(overview.discussionCounts.value.bySource).map(
                      ([source, count]) => (
                        <div
                          key={source}
                          className="px-2.5 py-1 rounded-md bg-muted/60 text-xs flex items-center gap-1.5"
                        >
                          <span className="capitalize text-muted-foreground">{source}:</span>
                          <span className="font-mono font-bold">{count}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </DimensionCard>

            {/* 5. Buyer-Intent Signals */}
            <DimensionCard
              title="5. Buyer-Intent Signals"
              icon={<DollarSign className="size-4 text-green-500" />}
              observed={overview.buyerIntentSignals.observed}
              rawLabel={overview.buyerIntentSignals.rawLabel}
              note={overview.buyerIntentSignals.note}
              evidence={overview.buyerIntentSignals.evidence}
            >
              {overview.buyerIntentSignals.value && (
                <div className="space-y-2.5 mt-2">
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                    <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                      <span className="text-[10px] text-green-700 dark:text-green-400 font-medium block">
                        Very Strong
                      </span>
                      <span className="font-mono font-bold">
                        {overview.buyerIntentSignals.value.veryStrongCount}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium block">
                        Strong
                      </span>
                      <span className="font-mono font-bold">
                        {overview.buyerIntentSignals.value.strongCount}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-muted border border-border">
                      <span className="text-[10px] text-muted-foreground font-medium block">
                        Medium/Weak
                      </span>
                      <span className="font-mono font-bold">
                        {overview.buyerIntentSignals.value.mediumCount +
                          overview.buyerIntentSignals.value.weakCount}
                      </span>
                    </div>
                  </div>

                  {overview.buyerIntentSignals.value.sampleQuotes.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-muted-foreground font-medium block">
                        Sample Intent Quotes:
                      </span>
                      {overview.buyerIntentSignals.value.sampleQuotes.slice(0, 2).map((sq, i) => (
                        <div
                          key={i}
                          className="p-2 rounded-lg bg-muted/40 border border-border/60 text-xs italic text-foreground/90 relative pl-6"
                        >
                          <Quote className="size-3 text-muted-foreground absolute left-2 top-2.5 opacity-50" />
                          <p className="line-clamp-2">&ldquo;{sq.quote}&rdquo;</p>
                          {sq.url && (
                            <a
                              href={sq.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 mt-1 not-italic"
                            >
                              <span>View post</span>
                              <ExternalLink className="size-2.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </DimensionCard>

            {/* 6. Marketplace Activity */}
            <DimensionCard
              title="6. Marketplace Activity"
              icon={<ShoppingBag className="size-4 text-purple-500" />}
              observed={overview.marketplaceActivity.observed}
              rawLabel={overview.marketplaceActivity.rawLabel}
              note={overview.marketplaceActivity.note}
              evidence={overview.marketplaceActivity.evidence}
            >
              {overview.marketplaceActivity.value && (
                <div className="space-y-2 mt-2">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {Object.entries(overview.marketplaceActivity.value.platforms).map(
                      ([plat, count]) => (
                        <Badge key={plat} variant="secondary" className="capitalize text-[11px]">
                          {plat}: {count}
                        </Badge>
                      )
                    )}
                  </div>
                  {overview.marketplaceActivity.value.priceRange && (
                    <p className="text-xs text-muted-foreground">
                      Price range: <span className="font-medium text-foreground">{overview.marketplaceActivity.value.priceRange}</span>
                    </p>
                  )}
                </div>
              )}
            </DimensionCard>

            {/* 7. Competitive Density */}
            <DimensionCard
              title="7. Competitive Density"
              icon={<ShieldCheck className="size-4 text-cyan-500" />}
              observed={overview.competitiveDensity.observed}
              rawLabel={overview.competitiveDensity.rawLabel}
              note={overview.competitiveDensity.note}
              evidence={overview.competitiveDensity.evidence}
            >
              {overview.competitiveDensity.value && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Density Rating:</span>
                    <Badge
                      className={`text-xs uppercase font-mono ${
                        overview.competitiveDensity.value.densityRating === "low"
                          ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
                          : overview.competitiveDensity.value.densityRating === "moderate"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                          : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
                      }`}
                    >
                      {overview.competitiveDensity.value.densityRating}
                    </Badge>
                  </div>
                  {overview.competitiveDensity.value.score !== null && (
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${overview.competitiveDensity.value.score}%` }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {overview.competitiveDensity.value.competitorsObserved} competitors observed in direct space
                  </p>
                </div>
              )}
            </DimensionCard>

            {/* 8. Pains */}
            <DimensionCard
              title="8. Customer Pains"
              icon={<AlertCircle className="size-4 text-orange-500" />}
              observed={overview.pains.observed}
              rawLabel={overview.pains.rawLabel}
              note={overview.pains.note}
              evidence={overview.pains.evidence}
            >
              {overview.pains.value && (
                <div className="space-y-2 mt-2">
                  {overview.pains.value.items.map((pain, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-medium text-foreground leading-tight">
                          {pain.problem}
                        </span>
                        {pain.frequency > 1 && (
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                            {pain.frequency}x
                          </Badge>
                        )}
                      </div>
                      {pain.audience && (
                        <span className="text-[11px] text-muted-foreground block">
                          Audience: {pain.audience}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DimensionCard>

            {/* 9. Underserved Submarkets */}
            <DimensionCard
              title="9. Underserved Submarkets"
              icon={<Sparkles className="size-4 text-yellow-500" />}
              observed={overview.underservedSubmarkets.observed}
              rawLabel={overview.underservedSubmarkets.rawLabel}
              note={overview.underservedSubmarkets.note}
              evidence={overview.underservedSubmarkets.evidence}
            >
              {overview.underservedSubmarkets.value && (
                <div className="space-y-2 mt-2">
                  {overview.underservedSubmarkets.value.items.map((sub, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-medium text-foreground leading-tight">
                          {sub.name}
                        </span>
                        {sub.demandScore !== undefined && (
                          <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                            Score: {sub.demandScore}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{sub.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </DimensionCard>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent for each of the 9 PRD §8 dimensions
interface DimensionCardProps {
  title: string;
  icon: React.ReactNode;
  observed: boolean;
  rawLabel: string;
  note?: string;
  evidence: EvidenceCitation[];
  children?: React.ReactNode;
}

function DimensionCard({
  title,
  icon,
  observed,
  rawLabel,
  note,
  evidence,
  children,
}: DimensionCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <Card className="flex flex-col justify-between border-border bg-card shadow-2xs">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm font-semibold tracking-tight">{title}</CardTitle>
          </div>
          {observed ? (
            <Badge variant="outline" className="text-[10px] font-mono bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 gap-1">
              <CheckCircle2 className="size-3" />
              Observed
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-mono bg-muted text-muted-foreground border-border gap-1">
              <XCircle className="size-3" />
              Not observed
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs mt-1 font-medium text-foreground">
          {rawLabel}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
        <div>
          {children}

          {note && (
            <p className="text-[11px] text-muted-foreground mt-2 italic">
              {note}
            </p>
          )}
        </div>

        {/* Evidence Citations Drawer/Dropdown */}
        {observed && evidence.length > 0 && (
          <div className="border-t border-border/60 pt-2 mt-2">
            <button
              type="button"
              onClick={() => setShowEvidence(!showEvidence)}
              className="text-[11px] text-primary hover:underline flex items-center justify-between w-full font-medium cursor-pointer"
            >
              <span>{evidence.length} Evidence Citation{evidence.length > 1 ? "s" : ""}</span>
              <ChevronRight
                className={`size-3 transition-transform ${
                  showEvidence ? "rotate-90" : ""
                }`}
              />
            </button>

            {showEvidence && (
              <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {evidence.map((cit, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded bg-muted/60 text-[10px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold uppercase tracking-wider text-[9px] text-muted-foreground">
                        {cit.source || "Evidence"}
                      </span>
                      {cit.url && (
                        <a
                          href={cit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>link</span>
                          <ExternalLink className="size-2" />
                        </a>
                      )}
                    </div>
                    <p className="line-clamp-2 text-foreground/90 font-mono">
                      {cit.claim}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
