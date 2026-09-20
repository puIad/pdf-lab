"use client";

// components/evidence/evidence-badge.tsx — Clickable citation badge showing evidence volume.

import React from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvidenceDialog } from "./evidence-dialog";
import type { EvidenceRow } from "@/lib/evidence/types";

export interface EvidenceBadgeProps {
  items: EvidenceRow[];
  label?: string;
  confidence?: number;
  className?: string;
}

export function EvidenceBadge({
  items,
  label,
  confidence,
  className = "",
}: EvidenceBadgeProps) {
  const count = items.length;
  const confText = confidence !== undefined ? `${Math.round(confidence * 100)}%` : null;

  return (
    <EvidenceDialog
      title="Evidence Citations & Source Excerpts"
      subtitle={`${count} verified evidence record${count === 1 ? "" : "s"} backing this claim (QC Rule 1)`}
      items={items}
      triggerNode={
        <Badge
          variant="outline"
          className={`cursor-pointer gap-1 px-2 py-0.5 text-xs font-mono transition-all hover:bg-accent hover:border-primary/50 ${className}`}
        >
          <ShieldCheck className="size-3 text-emerald-500" />
          <span>{label || `${count} citation${count === 1 ? "" : "s"}`}</span>
          {confText && <span className="text-muted-foreground">({confText})</span>}
        </Badge>
      }
    />
  );
}
