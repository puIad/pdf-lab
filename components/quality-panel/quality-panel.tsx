// components/quality-panel/quality-panel.tsx — Research Quality & Completeness panel per PRD §55.
// Visualizes evidence completeness, source distribution, signal analysis ratio, and QC Rules 1-5 compliance.

import React from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Database,
  Radio,
  FileCheck2,
  Layers,
  Sparkles,
  ArrowDownToLine,
  Check,
  X,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { ResearchCompleteness } from "@/lib/runs/types";
import type { QcRuleResult } from "@/lib/report/observed";
import { ExportActions } from "./export-actions";

interface QualityPanelProps {
  marketId: string;
  completeness: ResearchCompleteness;
  /** QC rules 1 to 5 checked on the market's stored rows (`marketQcRules`). */
  rules: QcRuleResult[];
  marketName?: string;
  /** Source types behind `sourcesCovered`, as stored. */
  sourceTypes?: string[];
  className?: string;
}

export function QualityPanel({
  marketId,
  completeness,
  rules,
  marketName,
  sourceTypes,
  className = "",
}: QualityPanelProps) {
  const pct = Math.min(100, Math.max(0, completeness.completenessPercentage || 0));
  const checked = rules.filter((r) => r.held !== null);
  const held = checked.filter((r) => r.held).length;
  const isHighQuality = pct >= 80;
  const backingRate =
    completeness.opportunitiesGenerated > 0
      ? Math.round(
          (completeness.evidenceBackedOpportunitiesCount /
            completeness.opportunitiesGenerated) *
            100,
        )
      : null;

  return (
    <Card className={`border-emerald-500/20 bg-emerald-500/[0.02] shadow-sm ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <CardTitle className="text-lg font-semibold tracking-tight">
                Research Quality & Completeness Panel
              </CardTitle>
              <Badge
                variant="outline"
                className={
                  isHighQuality
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium"
                }
              >
                {isHighQuality ? "High-Fidelity Evidence" : "Partial Evidence"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Anti-hallucination contract (PRD §30–§31, §55){marketName ? ` for ${marketName}` : ""}. Every number below is a
              count of this market&apos;s stored rows.
            </p>
          </div>

          {/* Export Actions Trigger */}
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3" /> Export Verified Report
            </span>
            <ExportActions marketId={marketId} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Completeness Meter */}
        <div className="space-y-2 rounded-lg border border-border/80 bg-background/60 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 font-medium">
              <span>Overall Research Completeness</span>
              <span className="text-xs text-muted-foreground">
                (Sources 20% + Volume 20% + Analysis 20% + QC rules held 15% + Backing 25%)
              </span>
            </div>
            <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
              {pct}%
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isHighQuality ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* 5 Core Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Sources Covered</span>
              <Radio className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold font-mono">{completeness.sourcesCovered}</div>
            <p className="text-[11px] text-muted-foreground truncate">
              {sourceTypes === undefined ? "Distinct source types" : sourceTypes.length > 0 ? sourceTypes.join(", ") : "None"}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Signals Analyzed</span>
              <Database className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold font-mono">
              {completeness.signalsAnalyzed}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {completeness.signalsCollected}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {completeness.signalsCollected > 0
                ? `${Math.round(
                    (completeness.signalsAnalyzed / completeness.signalsCollected) * 100,
                  )}% classified`
                : "Awaiting signals"}
            </p>
            {completeness.signalsAnalyzed < completeness.signalsCollected && (
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Partial: {completeness.signalsCollected - completeness.signalsAnalyzed} not analysed
              </p>
            )}
            {(completeness.signalsNotClustered ?? 0) > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {completeness.signalsNotClustered} analysed but in no market
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Problem Markets</span>
              <Layers className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="text-xl font-bold font-mono">
              {completeness.marketsIdentified}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              Cosine vector clusters
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Opportunities</span>
              <FileCheck2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono">
              {completeness.opportunitiesGenerated}{" "}
              <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                {backingRate === null ? "" : `(${backingRate}%)`}
              </span>
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
              {completeness.evidenceBackedOpportunitiesCount} evidence-backed
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total Citations</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-xl font-bold font-mono">
              {completeness.evidenceCount}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              Stored evidence rows
            </p>
          </div>
        </div>

        {/* QC Rules 1-5, each checked on this market's stored rows (#52) */}
        <div className="border-t border-border/60 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              QC rules checked on stored rows: {held} of {checked.length} hold
            </span>
          </div>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {rules.map((r) => {
              const tone =
                r.held === null
                  ? "text-muted-foreground"
                  : r.held
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400";
              const Mark = r.held === null ? Minus : r.held ? Check : X;
              return (
                <li key={r.rule} className="flex items-start gap-2 text-muted-foreground">
                  <span className={`flex items-center gap-0.5 font-mono font-bold ${tone}`}>
                    <Mark className="h-3 w-3" aria-hidden />R{r.rule}:
                  </span>
                  <span>
                    {r.text}
                    <span className="sr-only">
                      {r.held === null ? ", nothing to check" : r.held ? ", holds" : ", broken"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
