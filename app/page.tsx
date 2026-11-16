// app/page.tsx — Home (Part 6.12): the quick-ideas scan, which leads to Validate, the competition
// check and the brief, and below it the visitor's recent Deep runs. The market explorer that was
// here is at /markets; old `/?run=` links redirect there.

import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { IdeasView } from "@/app/ideas/ideas-view";
import { RecentDeepRuns, type RecentDeepRun } from "@/components/home/recent-deep-runs";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

async function loadRecentDeepRuns(): Promise<{ runs: RecentDeepRun[]; signedOut: boolean; error: string | null }> {
  try {
    const caller = await resolveCaller(await headers());
    if (caller.plan === "anon") return { runs: [], signedOut: true, error: null };
    const query = createServiceSupabaseClient()
      .from("research_runs")
      .select("id, query, status, started_at, markets ( id )")
      .eq("mode", "deep")
      .order("started_at", { ascending: false })
      .limit(6);
    // A person sees their own runs; the server key and a local dev server see all (Part 5.1).
    const { data, error } = await (caller.userId ? query.eq("user_id", caller.userId) : query);
    if (error) throw new Error(error.message);
    const runs = (data ?? []).map((r) => ({
      id: r.id as string,
      query: r.query as string,
      status: r.status as string,
      startedAt: r.started_at as string,
      markets: Array.isArray(r.markets) ? r.markets.length : 0,
    }));
    return { runs, signedOut: false, error: null };
  } catch (err) {
    return { runs: [], signedOut: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function HomePage(props: { searchParams: Promise<{ q?: string; region?: string; run?: string }> }) {
  const { q, region, run } = await props.searchParams;
  if (run) redirect(`/markets?run=${encodeURIComponent(run)}`);
  const recent = await loadRecentDeepRuns();
  return (
    <main className="flex-1 bg-background text-foreground">
      <IdeasView initialSeed={q?.trim() ?? ""} initialRegion={region ?? ""} />
      <div className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <RecentDeepRuns {...recent} />
      </div>
    </main>
  );
}
