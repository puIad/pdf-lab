// app/alerts/page.tsx: in-app alerts and the weekly digest (Phase 4 Part 4.3, PRD §45, DEC-010).
// Alerts are written by the daily monitor cron when a tracked seed's phrase crosses the watch's
// opportunity threshold or a watched market's re-run finds enough new buyer-intent signals.
// In-app only: no email or push (PRD §50).

import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { MarkAllRead, WatchAlertSettings } from "@/components/alerts/alert-controls";
import { DEFAULT_MARKET_THRESHOLD, DEFAULT_SEED_THRESHOLD, type Digest } from "@/lib/alerts/alerts";
import { loadAlerts, loadDigest, type AlertRow, type SettingRow } from "@/lib/alerts/load";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { REGIONS } from "@/lib/ideas/seeds";
import { resolveCaller } from "@/lib/quotas/guard";
import { listWatches } from "@/lib/watchlist/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts — PDF LAB", description: "Threshold alerts and the weekly digest for what you watch." };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const regionLabel = (code: string) => REGIONS.find((r) => r.code === code)?.label ?? code;
const scanHref = (seed: string, region: string) => `/?q=${encodeURIComponent(seed)}&region=${encodeURIComponent(region)}`;

function alertEvidence(a: AlertRow): React.ReactNode {
  const d = a.detail as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (a.kind === "opportunity") {
    return (
      <>
        Opportunity {d.previous == null ? "not seen" : d.previous} on {day(d.previousScanAt)} → {d.opportunity} on {day(d.scannedAt)} ·{" "}
        <Link href={scanHref(a.seed, a.region)} className="text-foreground underline underline-offset-2">
          open the scan
        </Link>
      </>
    );
  }
  return (
    <>
      Since {day(d.baselineAt)}: +{d.added.buyerIntent} buyer intent, +{d.added.complaints} complaints, +{d.added.competitors} competitors (re-run {day(d.at)}) ·{" "}
      <Link href={`/markets/${d.marketId}`} className="text-foreground underline underline-offset-2">
        open the market
      </Link>
    </>
  );
}

function DigestCard({ digest }: { digest: Digest }) {
  const nothing = digest.seeds.length === 0 && digest.markets.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2>This week’s digest</h2>
          <Badge variant="outline" className="font-mono tabular-nums">
            {digest.newIdeas} new {digest.newIdeas === 1 ? "idea" : "ideas"}
          </Badge>
        </CardTitle>
        <CardDescription>Since {day(digest.since)}, from the daily scans of what you track. Counts come from stored scans and re-runs; nothing is estimated.</CardDescription>
      </CardHeader>
      <CardContent>
        {nothing ? (
          <p className="text-sm text-muted-foreground">Track a seed or watch a market to get a digest.</p>
        ) : (
          <ul className="divide-y divide-border">
            {digest.seeds.map((s) => (
              <li key={s.watchId} className="space-y-0.5 py-3 first:pt-0 last:pb-0">
                <Link href={scanHref(s.seed, s.region)} className="text-sm font-medium capitalize underline-offset-4 hover:underline">
                  {s.seed}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">
                  {regionLabel(s.region)} · {s.count} new {s.count === 1 ? "idea" : "ideas"}
                </span>
                {s.phrases.map((p) => (
                  <p key={p.phrase} className="text-xs text-muted-foreground">
                    “{p.phrase}” first seen {day(p.firstSeen)}
                  </p>
                ))}
              </li>
            ))}
            {digest.markets.map((m) => (
              <li key={m.watchId} className="space-y-0.5 py-3 first:pt-0 last:pb-0">
                <Link href={`/markets/${m.marketId}`} className="text-sm font-medium underline-offset-4 hover:underline">
                  Market of “{m.seed}”
                </Link>{" "}
                <span className="text-xs text-muted-foreground">
                  {m.runs === 0
                    ? "no re-run with a baseline this week"
                    : `${m.runs} re-run${m.runs === 1 ? "" : "s"}: +${m.added.buyerIntent} buyer intent, +${m.added.complaints} complaints, +${m.added.competitors} competitors (${m.reports.map((r) => day(r.at)).join(", ")})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AlertsPage() {
  const caller = await resolveCaller(await headers());
  let alerts: AlertRow[] = [];
  let settings: Record<string, SettingRow> = {};
  let digest: Digest | null = null;
  let watches: Awaited<ReturnType<typeof listWatches>> = [];
  const marketNames = new Map<string, string>();
  let loadError: string | null = null;
  if (caller.userId) {
    try {
      watches = (await listWatches(caller.userId)).filter((w) => w.kind !== "idea");
      const ids = watches.filter((w) => w.kind === "market").map((w) => w.ref);
      if (ids.length > 0) {
        const { data } = await createServiceSupabaseClient().from("markets").select("id, name").in("id", ids);
        for (const m of data ?? []) marketNames.set(m.id as string, m.name as string);
      }
      // Migration 20 (alerts) and 19 (monitoring) come first: before they are applied, say so.
      ({ alerts, settings } = await loadAlerts(caller.userId));
      digest = await loadDigest(watches);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }
  const unread = alerts.filter((a) => !a.read_at).length;

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-1.5 border-b border-border pb-5">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Shown here when the daily check finds something you asked about. Nothing is emailed or pushed. <Link href="/watchlist" className="underline underline-offset-2">Back to your watchlist</Link>.
          </p>
        </div>

        {!caller.userId ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell />
              </EmptyMedia>
              <EmptyTitle>Sign in to see your alerts</EmptyTitle>
              <EmptyDescription>Alerts belong to the seeds and markets on your account’s watchlist.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/login?next=%2Falerts">
                <Button size="sm">Sign in</Button>
              </Link>
            </EmptyContent>
          </Empty>
        ) : loadError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not read your alerts: {loadError}
          </p>
        ) : (
          <>
            {digest ? <DigestCard digest={digest} /> : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <h2>Alerts</h2>
                    <Badge variant="outline" className="font-mono tabular-nums">
                      {unread} unread
                    </Badge>
                  </span>
                  <MarkAllRead unread={unread} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No alerts yet. One is written when a tracked seed’s idea reaches your threshold after being below it, or a watched market’s re-run finds enough new buyer-intent signals.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {alerts.map((a) => (
                      <li key={a.id} className="space-y-0.5 py-3 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium">
                          {!a.read_at ? <Badge className="mr-2">New</Badge> : null}
                          {a.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{alertEvidence(a)}</p>
                        <p className="text-xs text-muted-foreground">Raised {day(a.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Thresholds and muting</h2>
                </CardTitle>
                <CardDescription>A muted watch writes no alerts. Seeds alert on an opportunity score (default {DEFAULT_SEED_THRESHOLD}); markets on new buyer-intent signals in one re-run (default {DEFAULT_MARKET_THRESHOLD}).</CardDescription>
              </CardHeader>
              <CardContent>
                {watches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing watched yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {watches.map((w) => (
                      <li key={w.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium capitalize">{w.kind === "seed" ? `${w.ref} · ${regionLabel(w.region)}` : (marketNames.get(w.ref) ?? "A stored market")}</p>
                        <WatchAlertSettings
                          watchId={w.id}
                          initialThreshold={settings[w.id]?.threshold ?? null}
                          initialMuted={settings[w.id]?.muted ?? false}
                          defaultThreshold={w.kind === "seed" ? DEFAULT_SEED_THRESHOLD : DEFAULT_MARKET_THRESHOLD}
                          unit={w.kind === "seed" ? "opportunity" : "new buyer-intent signals"}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
