// app/ideas/page.tsx — Quick ideas (Phase 3 Parts 3.6 + 3.7): one seed + region → ranked per-phrase PDF
// ideas from search phrases (suggestions locally, Serper PAA / related in production), Google Trends and Wikipedia.

import React from "react";
import { IdeasView } from "./ideas-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quick ideas — PDF LAB",
  description: "Turn one topic into ranked PDF ideas from what people actually search, with an outline for each.",
};

export default async function IdeasPage(props: { searchParams: Promise<{ q?: string; region?: string }> }) {
  const { q, region } = await props.searchParams;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <IdeasView initialSeed={q?.trim() ?? ""} initialRegion={region ?? ""} />
    </main>
  );
}
