// lib/ideas/stored.ts — rebuild a seed's quick ideas from the phrase rows already in `signals`
// (Phase 3 Part 3.8). Every phrase source stores `engagement.seed`, so a Deep run on the seed reuses
// what earlier scans and its own ingest stored. No stored row, no idea (06-EVIDENCE-CONTRACT).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketSignal, SignalEngagement } from "../sources/types.ts";
import type { IdeaSignalRef } from "../opportunities/from-ideas.ts";
import { buildIdeas, type IdeasResult } from "./ideas.ts";

interface Row {
  external_id: string;
  source_id: string | null;
  url: string | null;
  title: string | null;
  content: string | null;
  engagement: SignalEngagement | null;
  sources: { type?: string } | { type?: string }[] | null;
}

export async function loadStoredIdeas(
  supabase: SupabaseClient,
  seed: string,
): Promise<{ result: IdeasResult; refs: Map<string, IdeaSignalRef> }> {
  const pattern = seed.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from("signals")
    .select("external_id, source_id, url, title, content, engagement, sources ( type )")
    .ilike("engagement->>seed", pattern)
    .limit(1000);
  if (error) throw new Error(`failed to load stored ideas: ${error.message}`);

  const refs = new Map<string, IdeaSignalRef>();
  const signals: MarketSignal[] = ((data ?? []) as Row[]).map((r) => {
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    refs.set(r.external_id, { sourceUuid: r.source_id, excerpt: r.content });
    return {
      source: src?.type ?? "unknown",
      source_id: r.external_id,
      url: r.url,
      title: r.title,
      text: r.content,
      author: null,
      timestamp: null,
      engagement: r.engagement ?? {},
      market_candidates: [],
      intent: null,
      pain_points: [],
    };
  });
  return { result: buildIdeas(seed, signals), refs };
}
