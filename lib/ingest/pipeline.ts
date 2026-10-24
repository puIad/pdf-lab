// lib/ingest/pipeline.ts — normalized signal ingest (Phase 1 Part 1.2).
//
// Flow per adapter: collect → normalize → dedup on (source_id, external_id)
// → insert. Dedup is enforced at BOTH layers: the DB unique constraint
// (04-SCHEMA invariant 2) via `ignoreDuplicates`, with code-level counts so
// the response can tell inserted vs duplicates apart.
//
// Degradation contract (08-ADAPTERS rule 3, PRD §55): one dead adapter NEVER
// sinks the run. Unconfigured adapters (SourceNotConfiguredError) report
// `skipped`; any other failure reports `failed` with the error text; the rest
// complete and the summary says exactly what ran.
//
// Adapter boundary: this module talks to the REGISTRY only — never to an
// adapter module directly (08-ADAPTERS rule 1). DB access is injected via
// IngestDeps so unit tests run with zero network and zero DB.

import type { MarketSignal, SourceAdapter } from "../sources/types.ts";
import { SourceNotConfiguredError } from "../sources/types.ts";

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
  };
}

/** One row for the `signals` table (04-SCHEMA.md). */
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
}

/** Receives each source's normalized signals once they are stored (Part 3.6 quick ideas). */
export type SignalSink = (adapterKey: string, signals: MarketSignal[]) => void;

async function ingestOne(
  adapter: SourceAdapter,
  query: string,
  limit: number,
  deps: IngestDeps,
  sink?: SignalSink,
): Promise<IngestSourceResult> {
  const base = {
    key: adapter.key,
    displayName: adapter.displayName,
    collected: 0,
    normalized: 0,
    inserted: 0,
    duplicates: 0,
  };
  try {
    const raw = await adapter.collect({ query, limit });
    const normalized: MarketSignal[] = [];
    for (const item of raw) normalized.push(adapter.normalize(item));
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
      normalized.length > 0
        ? await deps.upsertSignals(
            normalized.map((s) => toSignalRow(sourceUuid, s)),
          )
        : 0;
    sink?.(adapter.key, normalized);
    return {
      ...base,
      status: "ok",
      collected: raw.length,
      normalized: normalized.length,
      inserted,
      duplicates: normalized.length - inserted,
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
  input: { query: string; limit?: number; sourceKeys?: string[] },
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
    sources.push(await ingestOne(adapter, query, limit, resolved, sink));
  }
  const totals = sources.reduce(
    (acc, s) => ({
      collected: acc.collected + s.collected,
      normalized: acc.normalized + s.normalized,
      inserted: acc.inserted + s.inserted,
      duplicates: acc.duplicates + s.duplicates,
    }),
    { collected: 0, normalized: 0, inserted: 0, duplicates: 0 },
  );
  return { query, limit, ingestedAt: new Date().toISOString(), sources, totals };
}
