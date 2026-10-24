// app/ideas/page.tsx — Quick ideas (Phase 3 Part 3.6): one seed → ranked per-phrase PDF ideas
// from search suggestions (local-only, DEC-008), Google Trends and Wikipedia, each with an outline.

import React from "react";
import { IdeasView } from "./ideas-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quick ideas — PDF LAB",
  description: "Turn one topic into ranked PDF ideas from what people actually search, with an outline for each.",
};

export default async function IdeasPage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await props.searchParams;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <IdeasView initialSeed={q?.trim() ?? ""} />
    </main>
  );
}
