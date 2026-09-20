// components/evidence/evidence-list.tsx — Verifiable evidence citation list per PRD §30 & docs/06-EVIDENCE-CONTRACT.md.

import React from "react";
import { ExternalLink, Quote, ShieldCheck, Globe, MessageSquare, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { parseEvidenceClaim } from "@/lib/evidence/types";
import type { EvidenceRow } from "@/lib/evidence/types";

export interface EvidenceListProps {
  items: EvidenceRow[];
  emptyMessage?: string;
  className?: string;
}

function getSourceIcon(sourceType?: string) {
  switch (sourceType?.toLowerCase()) {
    case "reddit":
      return <MessageSquare className="size-3 text-orange-500" />;
    case "gtrends":
      return <TrendingUp className="size-3 text-blue-500" />;
    case "web":
    default:
      return <Globe className="size-3 text-emerald-500" />;
  }
}

export function EvidenceList({
  items,
  emptyMessage = "No direct evidence citations recorded yet.",
  className = "",
}: EvidenceListProps) {
  if (!items || items.length === 0) {
    return (
      <div className={`rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {items.map((item) => {
        const parsed = parseEvidenceClaim(item.claim);
        const confidencePct = parsed.confidence ? Math.round(parsed.confidence * 100) : null;

        return (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3.5 text-card-foreground shadow-2xs transition-colors hover:border-border"
          >
            {/* Metadata Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide">
                  {getSourceIcon(item.source_id ? "source" : undefined)}
                  <span>{parsed.signalType ? parsed.signalType.replace("_", " ") : "Evidence Citation"}</span>
                </Badge>

                {confidencePct !== null && (
                  <Badge
                    variant="secondary"
                    className={`text-[11px] font-medium ${
                      confidencePct >= 70
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : confidencePct >= 40
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    <ShieldCheck className="mr-1 size-3" />
                    {confidencePct}% confidence
                  </Badge>
                )}
              </div>

              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline hover:text-primary/80"
                >
                  <span className="max-w-[200px] truncate text-[11px] sm:max-w-[320px]">
                    {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>

            {/* Core Claim */}
            <div className="text-sm font-medium leading-relaxed text-foreground">
              {parsed.rawClaim}
            </div>

            {/* Verbatim Excerpt */}
            {item.excerpt && (
              <blockquote className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground italic border-l-2 border-primary/40">
                <Quote className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span>&ldquo;{item.excerpt}&rdquo;</span>
              </blockquote>
            )}

            {/* Timestamp */}
            {item.created_at && (
              <div className="text-[10px] text-muted-foreground/70">
                Logged {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
