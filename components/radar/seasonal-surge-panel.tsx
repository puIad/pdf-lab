// components/radar/seasonal-surge-panel.tsx — PRD §24 Seasonal Surge Intelligence.
// Visualizes markets anticipated to experience seasonal demand bursts in the next 30..60 days.

"use client";

import * as React from "react";
import { CalendarClock, Sparkles, Lightbulb } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SeasonalSurgeForecast } from "@/lib/trends/types";

interface SeasonalSurgePanelProps {
  forecasts: SeasonalSurgeForecast[];
}

export function SeasonalSurgePanel({ forecasts }: SeasonalSurgePanelProps) {
  if (!forecasts || forecasts.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/80 bg-card/70 backdrop-blur-xs shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
              <CalendarClock className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Seasonal Engine Forecasts <Sparkles className="size-3.5 text-cyan-500" />
              </CardTitle>
              <CardDescription className="text-xs">
                PRD §24 • Markets projected to surge in the next 30 to 60 days based on 12-month baseline data
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 text-xs font-mono">
            {forecasts.length} Surges Approaching
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {forecasts.map((f, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/60 bg-muted/30 p-3 flex flex-col justify-between gap-2 text-xs hover:border-cyan-500/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-foreground">{f.topicName}</span>
                  <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                    Peaks in {f.peakCalendarMonth}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed mb-2">
                  {f.historicalEvidence}
                </p>
              </div>

              <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 p-2 text-cyan-600 dark:text-cyan-400">
                <div className="flex items-start gap-1.5 text-[11px]">
                  <Lightbulb className="size-3.5 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Recommended Action:</strong> {f.actionRecommendation}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
