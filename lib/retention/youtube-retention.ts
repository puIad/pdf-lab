// lib/retention/youtube-retention.ts — 30-day refresh-or-delete for stored YouTube data.
// YouTube API Developer Policies III.E.4 (DEC-017): stored API data other than statistics must be
// refreshed or deleted after 30 days. Age is `signals.collected_at`; a refresh moves it to now.
// Dependent rows (signal_analysis, market_signals, run_signals) go with the signal (ON DELETE CASCADE).
// No YouTube code here: the adapter does the fetching (ADAPTERS.md rule 1).

import type { RawSignal } from "../sources/types.ts";

export const MAX_AGE_DAYS = 30;
export const BATCH_SIZE = 50;
export const MAX_BATCHES = 20; // per run; leftovers are picked up by the next daily run

export interface StaleSignal {
  id: string;
  external_id: string;
  engagement: Record<string, unknown>;
}

export interface SignalRefresh {
  title: string | null;
  content: string | null;
  engagement: Record<string, unknown>;
  collected_at: string;
}

export interface RetentionStore {
  /** Oldest first, collected before `cutoffIso`. Handled rows are updated or removed, so they do not return. */
  listStale(cutoffIso: string, limit: number): Promise<StaleSignal[]>;
  /** Evidence copies of YouTube text (excerpt, claim) have no FK to signals; delete those older than the cutoff. */
  removeStaleEvidence(cutoffIso: string): Promise<number>;
  update(id: string, patch: SignalRefresh): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

export interface Refresher {
  refresh(externalIds: string[]): Promise<{ refreshed: RawSignal[]; gone: string[] }>;
  normalize(raw: RawSignal): { title: string | null; text: string | null; engagement: Record<string, unknown> };
}

export interface RetentionResult {
  examined: number;
  refreshed: number;
  deleted: number;
  /** Evidence rows deleted because they copy YouTube text older than 30 days. */
  evidenceDeleted: number;
  /** Deleted because the refresh request itself failed (not because the comment is gone). */
  deletedOnFailure: number;
  error?: string;
}

export async function runYouTubeRetention(opts: {
  store: RetentionStore;
  refresher: Refresher;
  now?: () => number;
  maxAgeDays?: number;
}): Promise<RetentionResult> {
  const now = opts.now ?? Date.now;
  const cutoff = new Date(now() - (opts.maxAgeDays ?? MAX_AGE_DAYS) * 86_400_000).toISOString();
  const result: RetentionResult = { examined: 0, refreshed: 0, deleted: 0, evidenceDeleted: 0, deletedOnFailure: 0 };
  result.evidenceDeleted = await opts.store.removeStaleEvidence(cutoff);

  for (let b = 0; b < MAX_BATCHES; b++) {
    const rows = await opts.store.listStale(cutoff, BATCH_SIZE);
    if (rows.length === 0) break;
    result.examined += rows.length;

    const byExternal = new Map(rows.map((r) => [r.external_id, r]));
    const toDelete: string[] = [];
    try {
      const { refreshed, gone } = await opts.refresher.refresh(rows.map((r) => r.external_id));
      for (const raw of refreshed) {
        const row = byExternal.get(raw.externalId);
        if (!row) continue;
        const n = opts.refresher.normalize(raw);
        await opts.store.update(row.id, {
          title: n.title,
          content: n.text,
          // comments.list returns likes only; the stored reply count stays as it was
          engagement: { ...row.engagement, upvotes: n.engagement.upvotes },
          collected_at: new Date(now()).toISOString(),
        });
        byExternal.delete(raw.externalId);
        result.refreshed++;
      }
      for (const ext of gone) {
        const row = byExternal.get(ext);
        if (row) toDelete.push(row.id);
        byExternal.delete(ext);
      }
      // Anything the API neither returned nor reported gone is treated as gone.
      for (const row of byExternal.values()) toDelete.push(row.id);
    } catch (err) {
      // Refresh failed (no key, quota, network): the policy leaves deletion as the only option.
      result.error = err instanceof Error ? err.message : String(err);
      for (const row of byExternal.values()) toDelete.push(row.id);
      result.deletedOnFailure += toDelete.length;
    }
    if (toDelete.length) await opts.store.remove(toDelete);
    result.deleted += toDelete.length;
  }
  return result;
}
