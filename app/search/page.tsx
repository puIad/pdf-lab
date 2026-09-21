// app/search/page.tsx — Market Search & Overview Page per PRD §8, §41–§42.
// Evaluates free-text queries returning size proxy, search interest, trend direction,
// discussion counts, buyer-intent signals, marketplace activity, competitive density, pains,
// and underserved submarkets — each backed by evidence or explicitly "not observed".

import React from "react";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { generateMarketOverview, getSearchHistory } from "@/lib/search";
import type { MarketOverview, SearchHistoryItem } from "@/lib/search/types";
import { SearchView } from "./search-view";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    mode?: string;
    user_id?: string;
  }>;
}

export default async function SearchPage(props: SearchPageProps) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim() || "";
  const mode = searchParams.mode === "validate" ? "validate" : "explore";
  const userId = searchParams.user_id?.trim() || undefined;

  const supabase = createServiceSupabaseClient();

  let initialOverview: MarketOverview | null = null;
  let initialHistory: SearchHistoryItem[] = [];

  try {
    initialHistory = await getSearchHistory(supabase, { userId, limit: 10 });
  } catch (err) {
    console.error("Failed to load search history:", err);
  }

  if (q) {
    try {
      initialOverview = await generateMarketOverview(q, supabase, {
        userId,
        mode,
        persistRun: true,
      });
    } catch (err) {
      console.error(`Failed to generate market overview for "${q}":`, err);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SearchView
        initialQuery={q}
        initialMode={mode}
        initialOverview={initialOverview}
        initialHistory={initialHistory}
      />
    </main>
  );
}
