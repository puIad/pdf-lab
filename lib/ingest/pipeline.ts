// lib/ingest/pipeline.ts — normalized signal ingest (Phase 1 Part 1.2).
//
// Flow per adapter: collect → normalize → dedup on (source_id, external_id)
// → insert. Dedup is enforced at BOTH layers: the DB unique constraint
// (SCHEMA invariant 2) via `ignoreDuplicates`, with code-level counts so
// the response can tell inserted vs duplicates apart.
//
// Degradation contract (ADAPTERS rule 3, PRD §55): one dead adapter NEVER
// sinks the run. Unconfigured adapters (SourceNotConfiguredError) report
// `skipped`; any other failure reports `failed` with the error text; the rest
// complete and the summary says exactly what ran.
//
// Adapter boundary: this module talks to the REGISTRY only — never to an
// adapter module directly (ADAPTERS rule 1). DB access is injected via
// IngestDeps so unit tests run with zero network and zero DB.

import type { MarketSignal, SourceAdapter } from "../sources/types.ts";
import { SourceNotConfiguredError } from "../sources/types.ts";
import { normalizeUrlKey } from "../takedown/takedown.ts";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

export type IngestSourceStatus = "ok" | "skipped" | "failed";

export interface IngestSourceResult {
  key: string;
  displayName: string;
  status: IngestSourceStatus;
  collected: number;
  normalized: number;
  inserted: number;
  duplicates: number;
  /** Signals dropped because their URL is on the takedown blocklist (issue #76). */
  blocked: number;
  error?: string;
}

export interface IngestSummary {
  query: string;
  limit: number;
  ingestedAt: string;
  sources: IngestSourceResult[];
  totals: {
    collected: number;
    normalized: number;
    inserted: number;
    duplicates: number;
    blocked: number;
  };
}

/** One row for the `signals` table (SCHEMA.md). */
export interface SignalRow {
  source_id: string;
  external_id: string;
  url: string | null;
  title: string | null;
  content: string | null;
  published_at: string | null;
  engagement: MarketSignal["engagement"];
}

export function toSignalRow(sourceUuid: string, signal: MarketSignal): SignalRow {
  return {
    source_id: sourceUuid,
    external_id: signal.source_id,
    url: signal.url,
    title: signal.title,
    content: signal.text,
    published_at: signal.timestamp,
    engagement: signal.engagement,
  };
}

export interface IngestDeps {
  adapters: SourceAdapter[];
  /** Resolve the `sources.id` uuid for an adapter key (null = not seeded). */
  resolveSourceId: (adapterKey: string) => Promise<string | null>;
  /** Upsert rows; returns the count actually INSERTED (DB ignores conflicts). */
  upsertSignals: (rows: SignalRow[]) => Promise<number>;
  /** Which of these normalized URL keys are blocked (takedown list). Absent = nothing is blocked. */
  blockedUrlKeys?: (keys: string[]) => Promise<Set<string>>;
}

/** Receives each source's normalized signals once they are stored (Part 3.6 quick ideas). */
export type SignalSink = (adapterKey: string, signals: MarketSignal[]) => void;

async function ingestOne(
  adapter: SourceAdapter,
  query: string,
  limit: number,
  deps: IngestDeps,
  sink?: SignalSink,
  geo?: string,
): Promise<IngestSourceResult> {
  const base = {
    key: adapter.key,
    displayName: adapter.displayName,
    collected: 0,
    normalized: 0,
    inserted: 0,
    duplicates: 0,
    blocked: 0,
  };
  try {
    const raw = await adapter.collect({ query, limit, ...(geo ? { geo } : {}) });
    const normalized: MarketSignal[] = [];
    for (const item of raw) normalized.push(adapter.normalize(item));
    let kept = normalized;
    if (deps.blockedUrlKeys) {
      const keyOf = (s: MarketSignal) => normalizeUrlKey(s.url) ?? normalizeUrlKey(s.source_id);
      // Fail open: a missing takedowns table (migration not applied yet) or a read error must not
      // stop ingest. The blocklist is treated as empty and the error is logged.
      let blocked = new Set<string>();
      try {
        blocked = await deps.blockedUrlKeys(normalized.map(keyOf).filter((k): k is string => k !== null));
      } catch (e) {
        console.warn(`takedown blocklist unreadable, ingesting without it: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (blocked.size > 0) kept = normalized.filter((s) => !blocked.has(keyOf(s) ?? ""));
    }
    const sourceUuid = await deps.resolveSourceId(adapter.key);
    if (!sourceUuid) {
      return {
        ...base,
        status: "failed",
        collected: raw.length,
        normalized: normalized.length,
        error: `no sources row for type '${adapter.key}' — apply seed migration`,
      };
    }
    const inserted =
      kept.length > 0
        ? await deps.upsertSignals(
            kept.map((s) => toSignalRow(sourceUuid, s)),
          )
        : 0;
    sink?.(adapter.key, kept);
    return {
      ...base,
      status: "ok",
      collected: raw.length,
      normalized: normalized.length,
      inserted,
      duplicates: kept.length - inserted,
      blocked: normalized.length - kept.length,
    };
  } catch (err) {
    if (err instanceof SourceNotConfiguredError) {
      return { ...base, status: "skipped", error: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, status: "failed", error: message };
  }
}

export async function runIngest(
  input: { query: string; limit?: number; sourceKeys?: string[]; geo?: string },
  deps: IngestDeps,
  sink?: SignalSink,
): Promise<IngestSummary> {
  const query = (input.query ?? "").trim();
  if (!query) throw new Error("ingest requires a non-empty query");
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
  const resolved = deps;
  let adapters = resolved.adapters;
  if (input.sourceKeys) {
    const wanted = new Set(input.sourceKeys);
    const unknown = [...wanted].filter((k) => !adapters.some((a) => a.key === k));
    if (unknown.length > 0) {
      throw new Error(`unknown source keys: ${unknown.join(", ")}`);
    }
    adapters = adapters.filter((a) => wanted.has(a.key));
  }
  // Sequential on purpose: staggers unofficial-API calls (gtrends throttle)
  // instead of bursting all adapters at once.
  const sources: IngestSourceResult[] = [];
  for (const adapter of adapters) {
    sources.push(await ingestOne(adapter, query, limit, resolved, sink, input.geo));
  }
  const totals = sources.reduce(
    (acc, s) => ({
      collected: acc.collected + s.collected,
      normalized: acc.normalized + s.normalized,
      inserted: acc.inserted + s.inserted,
      duplicates: acc.duplicates + s.duplicates,
      blocked: acc.blocked + s.blocked,
    }),
    { collected: 0, normalized: 0, inserted: 0, duplicates: 0, blocked: 0 },
  );
  return { query, limit, ingestedAt: new Date().toISOString(), sources, totals };
}
