// app/admin/metrics/page.tsx — internal success-metrics dashboard (Phase 6 Part 6.2, PRD §58 to
// §59). The headline is the north star: validated opportunities discovered per active user, not
// searches performed. Every number is computed from stored rows; with nothing observed it says so.
// Visible only to the emails in METRICS_ADMIN_EMAILS, and to the developer on a local dev server.

import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { loadMetrics } from "@/lib/analytics/store";
import { WINDOW_DAYS, type Metrics } from "@/lib/analytics/metrics";
import { isMetricsAdmin, resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Metrics — PDF LAB", robots: { index: false } };

const pct = (share: number | null) => (share === null ? "Not observed" : `${Math.round(share * 100)}%`);

function Stat({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  );
}

export default async function MetricsPage() {
  const caller = await resolveCaller(await headers());
  if (!isMetricsAdmin(caller)) notFound();

  let m: Metrics | null = null;
  let loadError = "";
  try {
    m = await loadMetrics(createServiceSupabaseClient());
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="border-b border-border pb-5">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Success metrics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The last {WINDOW_DAYS} days, from stored runs, evidence and events. Internal.
          </p>
        </div>

        {!m ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            Could not read the metrics: {loadError}
          </p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription>North star: validated opportunities discovered per active user</CardDescription>
                <CardTitle className="text-4xl tabular-nums" data-testid="north-star">
                  {m.northStar === null ? "Not observed" : m.northStar.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {m.validatedOpportunities} validated opportunities (completed Deep runs, at least one sourced evidence row) across {m.activeUsers}{" "}
                active signed-in {m.activeUsers === 1 ? "user" : "users"} (a counted action or a metric event). Searches performed are not counted.
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                title="Claim-evidence coverage"
                value={pct(m.coverage.share)}
                note={`${m.coverage.withEvidence} of ${m.coverage.opportunities} opportunities have a sourced evidence row.`}
              />
              <Stat title="Opportunities saved" value={String(m.saved)} note="First saves of a market, seed or idea (usefulness)." />
              <Stat
                title="Useful votes"
                value={`${m.votes.useful} / ${m.votes.useful + m.votes.notUseful}`}
                note="Opportunities rated useful, of all rated (quality)."
              />
              <Stat title="New-market detections" value={String(m.newMarkets)} note="Markets in a Deep run that no earlier market carried." />
              <Stat
                title="Research to creation"
                value={pct(m.conversion.share)}
                note={`${m.conversion.creators} of ${m.conversion.discoverers} people who discovered an opportunity built a brief file.`}
              />
              <Stat
                title="Monitor returns"
                value={String(m.returns.events)}
                note={`Watchlist opens, one per person per day, by ${m.returns.people} ${m.returns.people === 1 ? "person" : "people"} (retention).`}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
