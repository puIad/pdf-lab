// lib/analytics/store.ts — writes metric events and loads the dashboard's numbers (Phase 6
// Part 6.2). Server-only: it takes the service-role client, the table has no policy for anyone else.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sourcedEvidenceCount } from "../evidence/qc.ts";
import type { EvidenceRow } from "../evidence/types.ts";
import { computeMetrics, newMarketEvent, WINDOW_DAYS, type Metrics, type MetricEvent, type MetricKind } from "./metrics.ts";

const CHUNK = 100;
const chunks = <T>(items: T[]): T[][] => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Writes one event. Throws when the row cannot be written. A vote replaces the person's earlier
 * vote; any other repeated dedupe key keeps the first row.
 */
export async function recordEvent(db: SupabaseClient, e: MetricEvent): Promise<void> {
  const row = { user_id: e.userId, kind: e.kind, subject_type: e.subjectType, subject_ref: e.subjectRef, value: e.value, dedupe_key: e.dedupeKey };
  const query = e.dedupeKey
    ? db.from("metric_events").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: e.kind !== "useful_vote" })
    : db.from("metric_events").insert(row);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/** A metric must never make the action it measures fail: log and go on. */
export async function recordEventSafely(db: SupabaseClient, e: MetricEvent): Promise<boolean> {
  try {
    await recordEvent(db, e);
    return true;
  } catch (err) {
    console.error(`Could not record the ${e.kind} event:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * After a Deep run saved its markets: one event for each whose name no earlier market carries
 * (exact match; the run's own rows do not count). A signed-out run has no one to credit.
 */
export async function recordNewMarkets(db: SupabaseClient, runId: string, markets: Array<{ id: string; name: string }>): Promise<void> {
  try {
    if (markets.length === 0) return;
    const { data: run, error: runErr } = await db.from("research_runs").select("user_id").eq("id", runId).maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run?.user_id) return;
    const { data: seen, error } = await db.from("markets").select("name").in("name", markets.map((m) => m.name)).or(`run_id.is.null,run_id.neq.${runId}`);
    if (error) throw new Error(error.message);
    const known = new Set((seen ?? []).map((r: { name: string }) => r.name));
    for (const m of markets.filter((m) => !known.has(m.name))) await recordEvent(db, newMarketEvent(run.user_id, m.id));
  } catch (err) {
    console.error("Could not record new-market events:", err instanceof Error ? err.message : err);
  }
}

/** Loads the window's rows from the database and computes the metrics. Throws when a read fails. */
export async function loadMetrics(db: SupabaseClient, now = new Date(), days = WINDOW_DAYS): Promise<{ metrics: Metrics; since: string }> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };

  const runs = must(
    await db.from("research_runs").select("id, user_id").eq("mode", "deep").eq("status", "completed").gte("completed_at", since),
  ) as Array<{ id: string; user_id: string | null }>;
  const owner = new Map(runs.map((r) => [r.id, r.user_id]));

  const opps: Array<{ id: string; run_id: string }> = [];
  for (const ids of chunks(runs.map((r) => r.id))) {
    opps.push(...(must(await db.from("opportunities").select("id, run_id").in("run_id", ids)) as typeof opps));
  }
  const evidence: EvidenceRow[] = [];
  for (const ids of chunks(opps.map((o) => o.id))) {
    evidence.push(
      ...(must(
        await db.from("evidence").select("id, entity_type, entity_id, source_id, claim, excerpt, url, created_at").eq("entity_type", "opportunity").in("entity_id", ids),
      ) as EvidenceRow[]),
    );
  }

  const events = must(await db.from("metric_events").select("kind, user_id, value").gte("created_at", since)) as Array<{ kind: MetricKind; user_id: string; value: number | null }>;
  const usage = must(await db.from("usage_events").select("user_id").not("user_id", "is", null).gte("created_at", since)) as Array<{ user_id: string }>;

  const metrics = computeMetrics({
    opportunities: opps.map((o) => ({ id: o.id, runUserId: owner.get(o.run_id) ?? null, sourcedEvidence: sourcedEvidenceCount(o.id, evidence) })),
    activeUserIds: [...usage.map((u) => u.user_id), ...events.map((e) => e.user_id)],
    events: events.map((e) => ({ kind: e.kind, userId: e.user_id, value: e.value })),
  });
  return { metrics, since };
}
