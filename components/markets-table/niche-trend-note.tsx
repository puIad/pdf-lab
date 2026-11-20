// components/markets-table/niche-trend-note.tsx — the seed's own Google Trends reading, shown as the
// niche's trend and never as a market's (issue #71, QC Rule 2).

import { LineChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { nicheTrendLine, type NicheTrend } from "@/lib/trends/niche";

export function NicheTrendNote({ trend }: { trend: NicheTrend }) {
  return (
    <Card data-testid="niche-trend">
      <CardContent className="flex items-start gap-3 py-3 text-xs leading-relaxed text-muted-foreground">
        <LineChart className="mt-0.5 size-4 shrink-0" />
        <p>
          {nicheTrendLine(trend)}
          {trend.url && (
            <>
              {" "}
              <a href={trend.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                Google Trends
              </a>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
