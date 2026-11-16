// app/search/page.tsx — Market Search & Overview Page per PRD §8, §41–§42.
// Evaluates free-text queries returning size proxy, search interest, trend direction,
// discussion counts, buyer-intent signals, marketplace activity, competitive density, pains,
// and underserved submarkets — each backed by evidence or explicitly "not observed".
// Part 5.1: a search opened by URL is counted like one sent to /api/search.

import React from "react";
import { headers } from "next/headers";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { generateMarketOverview, getSearchHistory } from "@/lib/search";
import type { MarketOverview, SearchHistoryItem } from "@/lib/search/types";
import { enforceQuota, refund, resolveCaller } from "@/lib/quotas/guard";
import { SearchView } from "./search-view";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    mode?: string;
  }>;
}

export default async function SearchPage(props: SearchPageProps) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const mode = searchParams.mode === "validate" ? "validate" : "explore";

  const supabase = createServiceSupabaseClient();
  const requestHeaders = await headers();

  let initialOverview: MarketOverview | null = null;
  let initialHistory: SearchHistoryItem[] = [];
  let initialError: string | null = null;

  const guard = q ? await enforceQuota(requestHeaders, "search") : null;
  const caller = guard?.caller ?? (await resolveCaller(requestHeaders));

  // History is private: a person's own; signed out there is none to show.
  if (caller.plan !== "anon") {
    try {
      initialHistory = await getSearchHistory(supabase, { userId: caller.userId ?? undefined, limit: 10 });
    } catch (err) {
      console.error("Failed to load search history:", err);
    }
  }

  if (guard?.error) initialError = guard.error;
  else if (q) {
    try {
      initialOverview = await generateMarketOverview(q, supabase, {
        userId: caller.userId ?? undefined,
        mode,
        persistRun: true,
      });
    } catch (err) {
      if (guard) await refund(guard); // the search failed: it does not count
      console.error(`Failed to generate market overview for "${q}":`, err);
    }
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <SearchView
        initialQuery={q}
        initialMode={mode}
        initialOverview={initialOverview}
        initialHistory={initialHistory}
        initialError={initialError}
      />
    </main>
  );
}
