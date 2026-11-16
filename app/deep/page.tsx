// app/deep/page.tsx — Deep research with a pasted model reply (Part 6.15, DEC-015).
// PDF Lab collects the signals, the user runs the analysis in a chat model and pastes the reply back.

import React from "react";
import { headers } from "next/headers";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { ownsRun, resolveCaller } from "@/lib/quotas/guard";
import { loadPastedRun, pastedRunState, type PastedRunState } from "@/lib/runs/pasted-run";
import { DeepView } from "./deep-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deep research — PDF LAB",
  description: "Collect a topic's signals, have a chat model analyse them, paste the reply back and get markets and opportunities.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DeepPage(props: { searchParams: Promise<{ seed?: string; run?: string }> }) {
  const { seed, run } = await props.searchParams;

  // ?run=<id>: a reload, or coming back from the chat model's tab. Same run, same prompt numbering.
  let initialRun: PastedRunState | null = null;
  let loadError: string | null = null;
  if (run && UUID.test(run)) {
    try {
      const loaded = await loadPastedRun(createServiceSupabaseClient(), run);
      if (!loaded) loadError = `No run ${run}.`;
      // A run's prompt holds its collected signals: only the person who started it reopens it (Part 5.1).
      else if (!ownsRun(await resolveCaller(await headers()), loaded.run.user_id)) loadError = "This run belongs to another account. Sign in as the person who started it.";
      else initialRun = pastedRunState(loaded.run, loaded.signals);
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <main className="flex-1 bg-background text-foreground">
      <DeepView key={initialRun?.runId ?? "new"} initialSeed={initialRun?.seed ?? seed?.trim() ?? ""} initialRun={initialRun} initialError={loadError} />
    </main>
  );
}
