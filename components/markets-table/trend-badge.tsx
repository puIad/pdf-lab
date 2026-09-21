// components/markets-table/trend-badge.tsx — Trend badge per PRD §7, §23.

import React from "react";
import { Flame, TrendingUp, Calendar, Minus, TrendingDown, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { MarketTrend } from "./types";

interface TrendBadgeProps {
  trend: MarketTrend;
  className?: string;
}

export function TrendBadge({ trend, className }: TrendBadgeProps) {
  switch (trend) {
    case "accelerating":
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400 font-medium gap-1 px-2 py-0.5",
            className
          )}
        >
          <TrendingUp className="size-3.5" />
          <span>Accelerating</span>
        </Badge>
      );
    case "emerging":
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400 font-medium gap-1 px-2 py-0.5",
            className
          )}
        >
          <Flame className="size-3.5 text-amber-500" />
          <span>Emerging</span>
        </Badge>
      );
    case "seasonal":
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-400 font-medium gap-1 px-2 py-0.5",
            className
          )}
        >
          <Calendar className="size-3.5" />
          <span>Seasonal</span>
        </Badge>
      );
    case "stable":
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 dark:bg-zinc-500/20 dark:text-zinc-400 font-medium gap-1 px-2 py-0.5",
            className
          )}
        >
          <Minus className="size-3.5" />
          <span>Stable</span>
        </Badge>
      );
    case "declining":
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-400 font-medium gap-1 px-2 py-0.5",
            className
          )}
        >
          <TrendingDown className="size-3.5" />
          <span>Declining</span>
        </Badge>
      );
    case "unknown":
    default:
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-muted text-muted-foreground border-border font-medium gap-1 px-2 py-0.5",
            className
          )}
        >
          <HelpCircle className="size-3.5" />
          <span>Unknown</span>
        </Badge>
      );
  }
}
