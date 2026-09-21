// components/markets-table/confidence-indicator.tsx — Confidence display with evidence tooltip per PRD §7, §54.

"use client";

import React, { useState } from "react";
import { ShieldCheck, AlertCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

interface ConfidenceIndicatorProps {
  confidence: number; // 0..1
  evidenceCount?: number;
  signalCount?: number;
  className?: string;
  showDetails?: boolean;
}

export function ConfidenceIndicator({
  confidence,
  evidenceCount = 0,
  signalCount = 0,
  className,
  showDetails = false,
}: ConfidenceIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const normalized = Math.max(0, Math.min(1, confidence));
  const percent = Math.round(normalized * 100);

  let tier: "High" | "Medium" | "Low" = "Low";
  let colorClass = "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 dark:text-zinc-400";
  let icon = <Info className="size-3" />;

  if (normalized >= 0.7) {
    tier = "High";
    colorClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
    icon = <ShieldCheck className="size-3" />;
  } else if (normalized >= 0.35) {
    tier = "Medium";
    colorClass = "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400";
    icon = <AlertCircle className="size-3" />;
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        aria-label={`Confidence: ${tier} (${percent}%). Click for evidence breakdown.`}
        className="inline-flex items-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <Badge
          variant="outline"
          className={cn(
            "text-[11px] font-mono tracking-tight gap-1 px-1.5 py-0 transition-colors hover:brightness-95",
            colorClass,
            className
          )}
        >
          {icon}
          <span>Conf {percent}%</span>
        </Badge>
      </button>

      {(isOpen || showDetails) && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md transition-opacity pointer-events-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border pb-1 mb-1.5 font-semibold">
            <span>Evidence Confidence</span>
            <span className={cn("font-mono", colorClass.split(" ")[1])}>
              {tier} ({percent}%)
            </span>
          </div>
          <div className="space-y-1 text-muted-foreground text-[11px] leading-snug">
            <p>
              Grounding: <span className="font-medium text-foreground">{evidenceCount}</span> evidence claims observed.
            </p>
            <p>
              Signals: <span className="font-medium text-foreground">{signalCount}</span> normalized market signals.
            </p>
            {normalized < 0.35 && (
              <p className="text-amber-600 dark:text-amber-400 text-[10px] mt-1 italic">
                Data is currently thin. Confidence will scale as more sources are collected.
              </p>
            )}
          </div>
          {/* Tooltip triangle */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-popover" />
        </div>
      )}
    </div>
  );
}
