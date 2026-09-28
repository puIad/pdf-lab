// app/research/page.tsx — Natural-language research + modes (PRD §26–§28, Phase 3 Part 3.4).
// Ask in plain words or type `pdf-lab <niche>`; the planner shows the structured query live,
// the chosen mode runs at its pipeline depth, and every run is logged with mode + rule-set version.

import React from "react";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { ResearchView, type RecentRun } from "./research-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Research — PDF LAB",
  description: "Ask PDF Lab in plain language: explore, validate, hunt, deep research, or monitor a market.",
};

interface ResearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ResearchPage(props: ResearchPageProps) {
  const { q } = await props.searchParams;

  let recentRuns: RecentRun[] = [];
  try {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from("research_runs")
      .select("id, query, mode, status, started_at, prompt_version")
      .not("prompt_version", "is", null)
      .order("started_at", { ascending: false })
      .limit(8);
    recentRuns = (data ?? []) as RecentRun[];
  } catch (err) {
    console.error("Failed to load recent research runs:", err);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <ResearchView initialPrompt={q?.trim() ?? ""} recentRuns={recentRuns} />
    </main>
  );
}
