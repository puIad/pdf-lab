// components/markets-table/explorer-table.tsx — DB-backed explorer table per PRD §7, §40.

"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Database,
  SearchX,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { TrendBadge } from "./trend-badge";
import { ConfidenceIndicator } from "./confidence-indicator";
import { ScoreBar } from "./score-bar";
import { DeepResearchDialog } from "./deep-research-dialog";
import type { MarketRowData } from "./types";

interface ExplorerTableProps {
  markets: MarketRowData[];
  isLoading?: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (newPage: number) => void;
  sortField: string;
  sortOrder: "asc" | "desc";
  onSortChange: (field: string) => void;
  onResetFilters: () => void;
  isFiltered: boolean;
}

export function ExplorerTable({
  markets,
  isLoading = false,
  page,
  pageSize,
  totalCount,
  onPageChange,
  sortField,
  sortOrder,
  onSortChange,
  onResetFilters,
  isFiltered,
}: ExplorerTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Render Sort Button
  function renderSortHeader(field: string, label: string) {
    const isCurrent = sortField === field;
    return (
      <button
        type="button"
        onClick={() => onSortChange(field)}
        className="flex items-center gap-1.5 font-medium hover:text-foreground text-xs uppercase tracking-wider select-none cursor-pointer focus-visible:outline-hidden"
      >
        <span>{label}</span>
        {isCurrent ? (
          sortOrder === "asc" ? (
            <ArrowUp className="size-3.5 text-primary" />
          ) : (
            <ArrowDown className="size-3.5 text-primary" />
          )
        ) : (
          <ArrowUpDown className="size-3 text-muted-foreground/60" />
        )}
      </button>
    );
  }

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <div className="p-4 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-border/50">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 2. Empty State — Honest per 06-EVIDENCE-CONTRACT (never invent fake rows)
  if (markets.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
        {isFiltered ? (
          <Empty className="py-12">
            <EmptyMedia variant="icon">
              <SearchX className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No markets match filters</EmptyTitle>
              <EmptyDescription>
                We could not find any markets matching your current search query or filter selections.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={onResetFilters} className="cursor-pointer">
                Reset all filters
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="py-12">
            <EmptyMedia variant="icon">
              <Database className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No markets observed yet</EmptyTitle>
              <EmptyDescription>
                The market database is currently empty. Run deep research on a niche to ingest live signals and build evidence-derived market clusters.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <DeepResearchDialog />
            </EmptyContent>
          </Empty>
        )}
      </div>
    );
  }

  // 3. Render Table
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[320px] py-3 pl-4">
                {renderSortHeader("name", "Market")}
              </TableHead>
              <TableHead className="w-[150px] py-3">
                {renderSortHeader("demand_score", "Demand")}
              </TableHead>
              <TableHead className="w-[140px] py-3">
                {renderSortHeader("trend", "Trend")}
              </TableHead>
              <TableHead className="w-[160px] py-3">
                {renderSortHeader("competition_score", "Competition")}
              </TableHead>
              <TableHead className="w-[280px] py-3 pr-4">
                {renderSortHeader("opportunity_score", "Opportunity")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markets.map((market) => {
              const topOpp = market.top_opportunity;
              const hasOpp = Boolean(topOpp);
              const oppScore = topOpp?.opportunity_score ?? 0;
              const oppConf = topOpp?.confidence ?? market.confidence;

              return (
                <TableRow
                  key={market.id}
                  className="group transition-colors hover:bg-muted/40 cursor-pointer"
                >
                  {/* Market Column */}
                  <TableCell className="py-3.5 pl-4 align-top">
                    <div className="flex flex-col gap-1 pr-2">
                      <Link
                        href={`/markets/${market.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5 group-hover:underline underline-offset-2"
                      >
                        <span className="text-sm font-semibold">{market.name}</span>
                        <ChevronRight className="size-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                      {market.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {market.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground"
                        >
                          {market.evidence_count} evidence {market.evidence_count === 1 ? "claim" : "claims"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {market.signal_count} {market.signal_count === 1 ? "signal" : "signals"}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* Demand Column */}
                  <TableCell className="py-3.5 align-top">
                    <div className="space-y-1 pr-4">
                      <ScoreBar
                        score={market.demand_score}
                        variant={market.demand_score >= 60 ? "emerald" : market.demand_score >= 30 ? "amber" : "primary"}
                      />
                      <span className="text-[10px] text-muted-foreground block">
                        {market.signal_count > 0 ? `${market.signal_count} signals` : "Thin volume"}
                      </span>
                    </div>
                  </TableCell>

                  {/* Trend Column */}
                  <TableCell className="py-3.5 align-top">
                    <TrendBadge trend={market.trend} />
                  </TableCell>

                  {/* Competition Column */}
                  <TableCell className="py-3.5 align-top">
                    <div className="space-y-1 pr-4">
                      <ScoreBar
                        score={market.competition_score}
                        variant={
                          market.competition_score > 70
                            ? "rose"
                            : market.competition_score > 30
                            ? "amber"
                            : "emerald"
                        }
                      />
                      <span className="text-[10px] text-muted-foreground block">
                        {market.competition_score < 30
                          ? "Low Density"
                          : market.competition_score <= 70
                          ? "Moderate"
                          : "High Saturation"}
                      </span>
                    </div>
                  </TableCell>

                  {/* Opportunity Column (+ confidence on hover/click per PRD §7, §54) */}
                  <TableCell className="py-3.5 pr-4 align-top">
                    <div className="flex flex-col gap-1.5">
                      {hasOpp ? (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              {topOpp?.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {topOpp?.format && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0 h-4 uppercase tracking-wider font-mono text-muted-foreground"
                                >
                                  {topOpp.format}
                                </Badge>
                              )}
                              <span className="text-[11px] font-mono font-semibold text-primary">
                                Score {oppScore}/100
                              </span>
                            </div>
                          </div>
                          <ConfidenceIndicator
                            confidence={oppConf}
                            evidenceCount={market.evidence_count}
                            signalCount={market.signal_count}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>PDF Fit {market.pdf_fit_score}/100</span>
                          <ConfidenceIndicator
                            confidence={market.confidence}
                            evidenceCount={market.evidence_count}
                            signalCount={market.signal_count}
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs text-muted-foreground">
          <div>
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount} markets
          </div>
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsis && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          isActive={p === page}
                          onClick={() => onPageChange(p)}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    </React.Fragment>
                  );
                })}
              <PaginationItem>
                <PaginationNext
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
