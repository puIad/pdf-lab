// lib/brief/index.ts — build-ready brief entrypoint (Phase 3 Part 3.10).

import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptNotes, buildBrief } from "./build.ts";
import { loadIdeaBriefInput, loadOpportunityBriefInput } from "./load.ts";
import { BriefUnavailable, type Brief, type BriefSource } from "./types.ts";

export * from "./types.ts";
export { buildBrief, briefCites, acceptNotes } from "./build.ts";
export { briefBlocks } from "./blocks.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a client-sent brief source; throws BriefUnavailable (400) when malformed. */
export function parseBriefSource(raw: unknown): BriefSource {
  const s = raw as Partial<Record<string, unknown>> | null;
  if (s?.kind === "opportunity" && typeof s.id === "string" && UUID_RE.test(s.id)) return { kind: "opportunity", id: s.id };
  if (
    s?.kind === "idea" &&
    typeof s.seed === "string" && s.seed.trim().length >= 2 && s.seed.length <= 100 &&
    typeof s.phrase === "string" && s.phrase.trim().length >= 2 && s.phrase.length <= 160
  ) {
    return { kind: "idea", seed: s.seed, phrase: s.phrase };
  }
  throw new BriefUnavailable("source must be { kind: 'opportunity', id: uuid } or { kind: 'idea', seed, phrase }", 400);
}

/** Load a brief from stored rows. Client-sent notes are kept only when they cite this brief's evidence. */
export async function loadBrief(supabase: SupabaseClient, source: BriefSource, notes?: unknown): Promise<Brief> {
  const input =
    source.kind === "opportunity"
      ? await loadOpportunityBriefInput(supabase, source.id)
      : await loadIdeaBriefInput(supabase, source.seed, source.phrase);
  const brief = buildBrief(input);
  brief.notes = acceptNotes(brief, notes);
  return brief;
}
