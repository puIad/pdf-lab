// lib/monitor/signals.ts — the dated discussion signals a Monitor query matches (QC Rule 2).

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "../db/read-all.ts";
import { tokenize } from "../planner/index.ts";
import { isDemandOnly } from "../sources/demand-only.ts";
import type { SignalRecord } from "../trends/detector.ts";

interface Row {
  id: string;
  title: string | null;
  content: string | null;
  published_at: string | null;
  external_id: string | null;
  engagement: Record<string, unknown> | null;
  sources: { type?: string } | { type?: string }[] | null;
  signal_analysis: { intent?: string | null; urgency?: string | null } | { intent?: string | null; urgency?: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Every dated signal (not only the newest 1000) whose text mentions a word of `text`. */
export async function loadMonitorSignals(supabase: SupabaseClient, text: string): Promise<SignalRecord[]> {
  const rows = await readAll<Row>("signals", () =>
    supabase
      .from("signals")
      .select("id, title, content, published_at, external_id, engagement, sources ( type ), signal_analysis ( intent, urgency )")
      .not("published_at", "is", null) // QC Rule 2: collection time is not temporal evidence
      .order("published_at", { ascending: false })
      .order("id"),
  );
  const tokens = tokenize(text).map((t) => t.replace(/s$/, ""));
  return rows
    .filter((s) => {
      if (isDemandOnly({ source_type: one(s.sources)?.type, external_id: s.external_id })) return false; // not discussions
      const hay = `${s.title ?? ""} ${s.content ?? ""}`.toLowerCase();
      return tokens.some((t) => hay.includes(t));
    })
    .map((s) => ({
      id: s.id,
      sourceType: one(s.sources)?.type ?? "unknown",
      title: s.title,
      content: s.content,
      publishedAt: s.published_at as string,
      engagement: s.engagement as SignalRecord["engagement"],
      intent: one(s.signal_analysis)?.intent ?? null,
      urgency: one(s.signal_analysis)?.urgency ?? null,
    }));
}
