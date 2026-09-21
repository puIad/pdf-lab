// components/markets-table/score-bar.tsx — Compact score bar per PRD §7.

import React from "react";
import { cn } from "cn";

interface ScoreBarProps {
  score: number; // 0..100
  label?: string;
  variant?: "emerald" | "amber" | "rose" | "violet" | "primary";
  className?: string;
}

export function ScoreBar({
  score,
  label,
  variant = "primary",
  className,
}: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const barColors: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    violet: "bg-purple-500",
    primary: "bg-primary",
  };

  const textColors: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    violet: "text-purple-600 dark:text-purple-400",
    primary: "text-foreground",
  };

  return (
    <div className={cn("flex flex-col gap-1 min-w-[72px]", className)}>
      <div className="flex items-center justify-between text-xs">
        {label && <span className="text-muted-foreground text-[11px]">{label}</span>}
        <span className={cn("font-mono font-semibold ml-auto", textColors[variant])}>
          {clamped}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300 rounded-full", barColors[variant])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
