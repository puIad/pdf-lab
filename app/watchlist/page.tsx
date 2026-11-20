// app/watchlist/page.tsx — My Watchlist (Phase 4 Part 4.1, PRD §43): the markets, tracked seeds
// and saved ideas of the signed-in person, grouped by kind. Signed out, the page asks for a
// sign-in: nothing is kept in the browser. Part 4.2: a daily cron re-scans tracked seeds and
// re-runs watched markets' seeds; rows show "N new this week", phrase changes and change reports.

import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Bookmark, Lightbulb, Search, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { WatchToggle } from "@/components/watchlist/watch-toggle";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { REGIONS } from "@/lib/ideas/seeds";
import { resolveCaller } from "@/lib/quotas/guard";
import { WATCHLIST_LIMIT } from "@/lib/quotas/quotas";
import { returnEvent } from "@/lib/analytics/metrics";
import { recordEventSafely } from "@/lib/analytics/store";
import { listWatches } from "@/lib/watchlist/store";
import { loadMonitorView, type MarketView, type SeedView } from "@/lib/monitor/view";
import { supabaseMonitorStore } from "@/lib/monitor/supabase-store";
import { COUNT_KEYS } from "@/lib/monitor/diff";
import type { WatchItem } from "@/lib/watchlist/watchlist";

export const dynamic = "force-dynamic";

export const metadata = { title: "Watchlist — PDF LAB", description: "The markets, seeds and ideas you saved in PDF Lab." };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const regionLabel = (code: string) => REGIONS.find((r) => r.code === code)?.label ?? code;
const scanHref = (seed: string, region: string) => `/?q=${encodeURIComponent(seed)}&region=${encodeURIComponent(region)}`;

interface StoredMarket {
  id: string;
  name: string;
  trend: string | null;
}

/** Names of the watched markets. Markets are public rows (SCHEMA.md), read like every market page. */
async function loadMarkets(ids: string[]): Promise<Map<string, StoredMarket>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await createServiceSupabaseClient().from("markets").select("id, name, trend").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as StoredMarket[]).map((m) => [m.id, m]));
}

function Group({ icon, title, hint, count, empty, children }: { icon: React.ReactNode; title: string; hint: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          <h2>{title}</h2>
          <Badge variant="outline" className="font-mono tabular-nums">
            {count}
          </Badge>
        </CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>{count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y divide-border">{children}</ul>}</CardContent>
    </Card>
  );
}

function Row({ item, children }: { item: WatchItem; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-0.5">{children}</div>
      <WatchToggle
        watch={{ kind: item.kind, ref: item.ref, region: item.region, seed: item.seed ?? undefined }}
        initialWatched
        on="Remove"
        off="Removed"
        size="xs"
        refreshOnChange
      />
    </li>
  );
}

export default async function WatchlistPage() {
  const caller = await resolveCaller(await headers());

  let items: WatchItem[] = [];
  let markets = new Map<string, StoredMarket>();
  let loadError: string | null = null;
  let seedViews: Record<string, SeedView> = {};
  let marketViews: Record<string, MarketView> = {};
  // Retention event (Part 6.2): one per person per day.
  if (caller.userId) {
    await recordEventSafely(createServiceSupabaseClient(), returnEvent(caller.userId, new Date()));
    try {
      items = await listWatches(caller.userId);
      markets = await loadMarkets(items.filter((i) => i.kind === "market").map((i) => i.ref));
      // The monitoring tables come with migration 19: before it is applied the rows show without changes.
      try {
        ({ seeds: seedViews, markets: marketViews } = await loadMonitorView(supabaseMonitorStore(), items));
      } catch (err) {
        console.error("Could not read monitoring data:", err);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }
  const of = (kind: WatchItem["kind"]) => items.filter((i) => i.kind === kind);
  const [marketRows, seedRows, ideaRows] = [of("market"), of("seed"), of("idea")];
  const plan = caller.plan === "premium" ? "premium" : "free";

  return (
    <main className="flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-1.5 border-b border-border pb-5">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">My watchlist</h1>
          <p className="text-sm text-muted-foreground">
            {caller.userId
              ? `${items.length} of ${WATCHLIST_LIMIT[plan]} saved on the ${plan} plan. Seeds and markets are re-checked once a day.`
              : "Markets, seeds and ideas you save, kept with your account."}
          </p>
        </div>

        {!caller.userId ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bookmark />
              </EmptyMedia>
              <EmptyTitle>Sign in to keep a watchlist</EmptyTitle>
              <EmptyDescription>
                A watchlist belongs to an account, so it is there on every device. Nothing is saved in this browser while you are signed out.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/login?next=%2Fwatchlist">
                <Button size="sm">Sign in</Button>
              </Link>
            </EmptyContent>
          </Empty>
        ) : loadError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not read your watchlist: {loadError}
          </p>
        ) : (
          <>
            <Group
              icon={<TrendingUp className="size-4 text-muted-foreground" aria-hidden />}
              title="Markets"
              hint="Markets from Deep runs. Save one with Watch market on its report page."
              count={marketRows.length}
              empty="No market saved yet."
            >
              {marketRows.map((item) => {
                const view = marketViews[item.id];
                // The market follows its seed: a newer run of the seed shows its same-named market.
                const market = view?.market ? (markets.get(view.market.id) ?? markets.get(item.ref)) : markets.get(item.ref);
                const report = view?.report;
                return (
                  <Row key={item.id} item={item}>
                    {market ? (
                      <Link href={`/markets/${market.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
                        {market.name}
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">This market is no longer stored.</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {market ? `Trend: ${market.trend ?? "unknown"} · ` : ""}saved {day(item.created_at)}
                    </p>
                    {view && !view.market ? <p className="text-xs text-muted-foreground">Not in the newest run of its seed.</p> : null}
                    {report ? (
                      <p className="text-xs text-muted-foreground">
                        {report.deltas
                          ? `Since ${day(report.baselineAt ?? report.createdAt)}: ${COUNT_KEYS.map((k) => `${report.deltas![k] > 0 ? "+" : ""}${report.deltas![k]} ${k}`).join(", ")}`
                          : `First reading ${day(report.createdAt)}.`}
                        {report.note ? ` ${report.note}` : ""}
                      </p>
                    ) : null}
                  </Row>
                );
              })}
            </Group>

            <Group
              icon={<Search className="size-4 text-muted-foreground" aria-hidden />}
              title="Tracked seeds"
              hint="Topics you scan for ideas, per region. Save one with Track this seed on a scan."
              count={seedRows.length}
              empty="No seed tracked yet."
            >
              {seedRows.map((item) => (
                <Row key={item.id} item={item}>
                  <Link href={scanHref(item.ref, item.region)} className="block truncate text-sm font-medium capitalize underline-offset-4 hover:underline">
                    {item.ref}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {regionLabel(item.region)} · saved {day(item.created_at)}
                  </p>
                  {seedViews[item.id]?.lastScanAt ? (
                    <p className="text-xs text-muted-foreground">
                      {seedViews[item.id].newThisWeek.count} new this week (since {day(seedViews[item.id].newThisWeek.since)}) · last scan {day(seedViews[item.id].lastScanAt!)}
                      {seedViews[item.id].newThisWeek.phrases.slice(0, 3).map((p) => ` · “${p.phrase}” first seen ${day(p.firstSeen)}`)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not scanned yet: the first daily scan sets the baseline.</p>
                  )}
                </Row>
              ))}
            </Group>

            <Group
              icon={<Lightbulb className="size-4 text-muted-foreground" aria-hidden />}
              title="Saved ideas"
              hint="Single ideas from a scan, kept by their search phrase. Save one with Save on its card."
              count={ideaRows.length}
              empty="No idea saved yet."
            >
              {ideaRows.map((item) => (
                <Row key={item.id} item={item}>
                  <p className="truncate text-sm font-medium">“{item.ref}”</p>
                  <p className="text-xs text-muted-foreground">
                    {item.seed ? (
                      <>
                        From the scan of{" "}
                        <Link href={scanHref(item.seed, item.region)} className="text-foreground underline underline-offset-2">
                          {item.seed}
                        </Link>{" "}
                        ·{" "}
                      </>
                    ) : null}
                    {regionLabel(item.region)} · saved {day(item.created_at)}
                  </p>
                </Row>
              ))}
            </Group>
          </>
        )}
      </div>
    </main>
  );
}
