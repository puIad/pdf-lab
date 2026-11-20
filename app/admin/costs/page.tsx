// app/admin/costs/page.tsx: internal cost-per-run dashboard from the AI usage ledger (Part 5.3).
// Measured cost next to the documented ceiling; a run above its ceiling is listed. With nothing
// in the ledger it says so. Same access rule as /admin/metrics.

import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isMetricsAdmin, resolveCaller } from "@/lib/quotas/guard";
import { LIMITS, PLAN_BUDGET_USD, worstCaseMonthlyUsd, USAGE_KINDS, KIND_LABEL, type Plan } from "@/lib/quotas/quotas";
import { COST_CEILING_USD, formatUsd, summarizeRuns, type RunCost } from "@/lib/usage/cost";
import { COST_WINDOW_DAYS, loadRunCosts } from "@/lib/usage/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Costs — PDF LAB", robots: { index: false } };

const usd = (n: number | null) => (n === null ? "Not observed" : formatUsd(n));

export default async function CostsPage() {
  const caller = await resolveCaller(await headers());
  if (!isMetricsAdmin(caller)) notFound();

  let runs: RunCost[] = [];
  let loadError = "";
  try {
    runs = await loadRunCosts();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  const modes = [...new Set(runs.map((r) => r.mode ?? "unknown"))].sort();
  const deep = summarizeRuns(runs);

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="border-b border-border pb-5">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Cost per run</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The last {COST_WINDOW_DAYS} days of the AI usage ledger, summed per run. Costs are estimates (reported, rate table or unpriced). Internal.
          </p>
        </div>

        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not read the ledger: {loadError}
          </p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription>Deep runs in the ledger</CardDescription>
                <CardTitle className="text-4xl tabular-nums" data-testid="deep-median">
                  {usd(deep.medianUsd)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Median of {deep.runs} {deep.runs === 1 ? "run" : "runs"}; mean {usd(deep.meanUsd)}, p90 {usd(deep.p90Usd)}, max {usd(deep.maxUsd)}. Documented ceiling{" "}
                  {formatUsd(COST_CEILING_USD.deep)}.
                </p>
                {deep.partlyUnpriced > 0 && <p>{deep.partlyUnpriced} of these runs include unpriced calls, so their cost is a lower bound.</p>}
                {deep.overCeiling.length > 0 ? (
                  <p role="alert" className="text-destructive">
                    Over the ceiling: {deep.overCeiling.map((r) => `${r.runId.slice(0, 8)} (${formatUsd(r.costUsd)})`).join(", ")}
                  </p>
                ) : (
                  deep.runs > 0 && <p>No run is over the ceiling.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By run mode</CardTitle>
              </CardHeader>
              <CardContent>
                {modes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not observed: no run has a ledger row yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs text-muted-foreground hover:bg-transparent">
                        <TableHead className="font-medium">Mode</TableHead>
                        <TableHead className="font-medium">Runs</TableHead>
                        <TableHead className="font-medium">Median</TableHead>
                        <TableHead className="font-medium">Max</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modes.map((m) => {
                        const s = summarizeRuns(runs.map((r) => ({ ...r, mode: r.mode ?? "unknown" })), m);
                        return (
                          <TableRow key={m}>
                            <TableCell>{m}</TableCell>
                            <TableCell className="tabular-nums">{s.runs}</TableCell>
                            <TableCell className="font-mono tabular-nums">{usd(s.medianUsd)}</TableCell>
                            <TableCell className="font-mono tabular-nums">{usd(s.maxUsd)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Plan limits against budget</CardTitle>
                <CardDescription>Worst case: every limit used to the top for a 31-day month, at the per-action ceilings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {USAGE_KINDS.map((k) => (
                    <li key={k}>
                      {KIND_LABEL[k]}: ceiling {formatUsd(COST_CEILING_USD[k])} each
                    </li>
                  ))}
                </ul>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs text-muted-foreground hover:bg-transparent">
                      <TableHead className="font-medium">Plan</TableHead>
                      <TableHead className="font-medium">Budget</TableHead>
                      <TableHead className="font-medium">Worst case</TableHead>
                      <TableHead className="font-medium">Deep cap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(["anon", "free", "premium"] as Plan[]).map((p) => (
                      <TableRow key={p}>
                        <TableCell>{p}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatUsd(PLAN_BUDGET_USD[p])}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatUsd(worstCaseMonthlyUsd(p))}</TableCell>
                        <TableCell className="tabular-nums">{LIMITS[p].deep.max} a month</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
