// components/radar/radar-node-tooltip.tsx — Radar node detail popover card.
// Displays velocity deltas, momentum score, source counts, complaint quotes, and PDF solvability.

"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, TrendingUp, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfidenceIndicator } from "@/components/markets-table/confidence-indicator";
import type { RadarNode, TimeWindow } from "@/lib/trends/types";

function YouTubeIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

interface RadarNodeTooltipProps {
  node: RadarNode;
  activeWindow: TimeWindow;
  onClose?: () => void;
}

export function RadarNodeTooltip({ node, activeWindow }: RadarNodeTooltipProps) {
  const { analysis, coordinates } = node;
  const metrics = analysis.windows[activeWindow];

  const signWoW = analysis.wowDeltaPercent >= 0 ? "+" : "";
  const signMoM = analysis.momDeltaPercent >= 0 ? "+" : "";

  return (
    <Card className="w-80 shadow-xl border-border/80 bg-card/95 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className="text-xs font-semibold uppercase tracking-wider capitalize"
            style={{
              borderColor: coordinates.velocityColor,
              color: coordinates.velocityColor,
              backgroundColor: `${coordinates.velocityColor}15`,
            }}
          >
            {analysis.classification.replace("_", " ")}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">
            {activeWindow} window
          </span>
        </div>
        <CardTitle className="text-sm font-bold line-clamp-2 mt-1">
          {analysis.topicName}
        </CardTitle>
        <CardDescription className="text-xs capitalize">
          Category: {analysis.category}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 pt-0 text-xs">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-2 text-xs">
          <div>
            <div className="text-muted-foreground">Velocity (WoW)</div>
            <div className={`font-mono font-bold flex items-center gap-1 ${analysis.wowDeltaPercent >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              <TrendingUp className="size-3" />
              {signWoW}{analysis.wowDeltaPercent}%
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Momentum Score</div>
            <div className="font-mono font-bold text-primary">
              {analysis.momentumScore}/100
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Mention Volume</div>
            <div className="font-mono font-medium">
              {metrics ? metrics.mentionCount : analysis.evidenceCount} mentions
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">MoM Delta</div>
            <div className="font-mono font-medium text-muted-foreground">
              {signMoM}{analysis.momDeltaPercent}%
            </div>
          </div>
        </div>

        {/* Source Distribution */}
        <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/50">
          <span className="flex items-center gap-1">
            <YouTubeIcon className="size-3 text-red-500" />
            {metrics?.youtubeCount ?? 0} YouTube
          </span>
          <span className="flex items-center gap-1 font-mono">
            <span className="text-orange-500 font-bold">r/</span>
            {metrics?.redditCount ?? 0} Reddit
          </span>
          <span className="flex items-center gap-1">
            Gap: <strong className="text-foreground">{analysis.gapIndex}x</strong>
          </span>
        </div>

        {/* Top Customer Complaint Quote */}
        {analysis.topPainQuote && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
            <div className="flex items-center gap-1 font-semibold text-[11px] mb-0.5">
              <AlertCircle className="size-3 shrink-0" />
              Observed Customer Friction:
            </div>
            <p className="italic text-[11px] line-clamp-2">
              &ldquo;{analysis.topPainQuote}&rdquo;
            </p>
          </div>
        )}

        {/* PDF Solvability & Recommended Formats */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-muted-foreground">
              <FileText className="size-3 text-primary" />
              PDF Solvability:
            </span>
            <span className="font-mono font-bold flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="size-3" />
              {Math.round(analysis.pdfFitScore * 100)}%
            </span>
          </div>
          {analysis.recommendedFormats.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {analysis.recommendedFormats.map((fmt) => (
                <span
                  key={fmt}
                  className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium uppercase"
                >
                  {fmt.replace("_", " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Confidence & Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <ConfidenceIndicator confidence={analysis.confidence} />
          <Link
            href={`/markets/${analysis.marketId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Explore Market <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
