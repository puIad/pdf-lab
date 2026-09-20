// components/evidence/facts-interpretation-suggestion.tsx — Enforces QC Rule 5: Facts != interpretation != suggestion.
// Visually separates observed ground truth, analytical models, and strategic suggestions.

import React from "react";
import { Database, BrainCircuit, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface FactsInterpretationSuggestionProps {
  facts: {
    signalsCount: number;
    sourcesCount: number;
    sampleExcerpts: Array<{ quote: string; source?: string | null; url?: string | null }>;
  };
  interpretation: {
    demandScore: number;
    trendLabel: string;
    urgency: string;
    confidence: number;
    sampleSizeNote?: string;
  };
  suggestion: {
    format: string;
    mechanism: string;
    outcome: string;
    priceRange: string;
  };
  className?: string;
}

export function FactsInterpretationSuggestion({
  facts,
  interpretation,
  suggestion,
  className = "",
}: FactsInterpretationSuggestionProps) {
  const confPct = Math.round(interpretation.confidence * 100);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
          <span>Three-Layer Evidence Verification</span>
          <Badge variant="outline" className="text-[10px] font-mono uppercase">QC Rule 5</Badge>
        </h3>
        <span className="text-xs text-muted-foreground">Observed Facts ≠ Model Interpretation ≠ Product Suggestions</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Layer 1: Observed Facts */}
        <Card className="border-sky-500/30 bg-sky-50/20 dark:bg-sky-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Database className="size-4" />
              <CardTitle className="text-sm font-semibold">1. Observed Facts</CardTitle>
            </div>
            <span className="text-[11px] text-muted-foreground">Unmodified, verifiable observations</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5 text-xs text-foreground">
            <div className="flex justify-between border-b border-sky-200/40 dark:border-sky-800/40 pb-1.5">
              <span className="text-muted-foreground">Observed Signals:</span>
              <span className="font-semibold">{facts.signalsCount} discussions</span>
            </div>
            <div className="flex justify-between border-b border-sky-200/40 dark:border-sky-800/40 pb-1.5">
              <span className="text-muted-foreground">Sources Monitored:</span>
              <span className="font-semibold">{facts.sourcesCount} platform{facts.sourcesCount === 1 ? "" : "s"}</span>
            </div>

            {facts.sampleExcerpts.length > 0 && (
              <div className="mt-1 flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">Verbatim quote excerpt:</span>
                <blockquote className="rounded bg-sky-500/5 p-2 text-[11px] italic text-muted-foreground border-l-2 border-sky-500/50">
                  &ldquo;{facts.sampleExcerpts[0].quote}&rdquo;
                </blockquote>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Layer 2: Interpretation */}
        <Card className="border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <BrainCircuit className="size-4" />
              <CardTitle className="text-sm font-semibold">2. AI Interpretation</CardTitle>
            </div>
            <span className="text-[11px] text-muted-foreground">Statistical formulas & classifications</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5 text-xs text-foreground">
            <div className="flex justify-between border-b border-amber-200/40 dark:border-amber-800/40 pb-1.5">
              <span className="text-muted-foreground">Demand Calculation:</span>
              <span className="font-semibold">{interpretation.demandScore} / 100</span>
            </div>
            <div className="flex justify-between border-b border-amber-200/40 dark:border-amber-800/40 pb-1.5">
              <span className="text-muted-foreground">Trend Velocity:</span>
              <span className="font-semibold capitalize">{interpretation.trendLabel}</span>
            </div>
            <div className="flex justify-between border-b border-amber-200/40 dark:border-amber-800/40 pb-1.5">
              <span className="text-muted-foreground">Urgency Level:</span>
              <span className="font-semibold capitalize">{interpretation.urgency}</span>
            </div>
            <div className="flex justify-between pt-0.5 items-center">
              <span className="text-muted-foreground">Statistical Confidence:</span>
              <Badge
                variant="outline"
                className={`text-[11px] ${
                  confPct >= 70 ? "text-emerald-600 border-emerald-500/40" : "text-amber-600 border-amber-500/40"
                }`}
              >
                {confPct >= 70 ? <CheckCircle2 className="size-3 mr-1" /> : <AlertCircle className="size-3 mr-1" />}
                {confPct}% confidence
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Layer 3: Suggestion */}
        <Card className="border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="size-4" />
              <CardTitle className="text-sm font-semibold">3. Product Suggestion</CardTitle>
            </div>
            <span className="text-[11px] text-muted-foreground">Strategic product recommendations</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5 text-xs text-foreground">
            <div className="flex justify-between border-b border-emerald-200/40 dark:border-emerald-800/40 pb-1.5">
              <span className="text-muted-foreground">Recommended Format:</span>
              <Badge variant="secondary" className="capitalize text-[11px] font-medium">
                {suggestion.format.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex justify-between border-b border-emerald-200/40 dark:border-emerald-800/40 pb-1.5">
              <span className="text-muted-foreground">Pricing Tier:</span>
              <span className="font-semibold">{suggestion.priceRange}</span>
            </div>
            <div className="flex flex-col gap-1 border-b border-emerald-200/40 dark:border-emerald-800/40 pb-1.5">
              <span className="text-muted-foreground">Mechanism:</span>
              <span className="text-[11px] font-medium leading-tight">{suggestion.mechanism}</span>
            </div>
            <div className="flex flex-col gap-1 pt-0.5">
              <span className="text-muted-foreground">Target Outcome:</span>
              <span className="text-[11px] font-medium leading-tight">{suggestion.outcome}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
