// components/home/recent-deep-runs.tsx — the home page's list of recent Deep runs (Part 6.12).
// Runs are private (Part 5.1): a person sees their own, a local dev server sees all, and a
// signed-out visitor is asked to sign in.

import React from "react";
import Link from "next/link";
import { ArrowRight, Microscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface RecentDeepRun {
  id: string;
  query: string;
  status: string;
  startedAt: string;
  markets: number;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Where a run goes next, by its state: its markets, back to the paste step, or nowhere. */
function next(run: RecentDeepRun): { href: string; label: string } | null {
  if (run.status === "completed") return run.markets > 0 ? { href: `/markets?run=${run.id}`, label: `${run.markets} market${run.markets === 1 ? "" : "s"}` } : null;
  if (run.status === "classifying") return { href: `/deep?run=${run.id}`, label: "Paste the reply" };
  return null;
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  completed: { label: "Completed", variant: "secondary" },
  classifying: { label: "Waiting for the reply", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export function RecentDeepRuns({ runs, signedOut, error }: { runs: RecentDeepRun[]; signedOut: boolean; error: string | null }) {
  return (
    <section aria-labelledby="recent-deep-runs" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-deep-runs" className="text-sm font-semibold">
          Recent Deep runs
        </h2>
        {runs.length > 0 && (
          <Link href="/markets" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            All markets
          </Link>
        )}
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">Your Deep runs could not be loaded: {error}</p>
      ) : signedOut ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>{" "}
          to run Deep research on a topic you scanned. Your runs appear here.
        </p>
      ) : runs.length === 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Microscope className="mt-0.5 size-4 shrink-0" aria-hidden />
          No Deep runs yet. Scan a topic above, then choose Go deeper on this seed.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {runs.map((run) => {
            const go = next(run);
            const status = STATUS[run.status] ?? { label: run.status, variant: "outline" as const };
            return (
              <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">{run.query}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{day(run.startedAt)}</span>
                <Badge variant={status.variant} className="text-[10px]">
                  {status.label}
                </Badge>
                {go && (
                  <Link href={go.href} className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline">
                    {go.label}
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
