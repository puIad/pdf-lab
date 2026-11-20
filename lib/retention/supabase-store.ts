// lib/retention/supabase-store.ts — service-role store for the YouTube retention job.
import { createServiceSupabaseClient } from "../db/client.ts";
import type { RetentionStore } from "./youtube-retention.ts";

export function supabaseRetentionStore(): RetentionStore {
  const db = createServiceSupabaseClient();
  let sourceId: string | undefined;
  const source = async () => {
    if (sourceId) return sourceId;
    const { data, error } = await db.from("sources").select("id").eq("type", "youtube").maybeSingle();
    if (error) throw error;
    return (sourceId = data?.id ?? "");
  };
  return {
    async listStale(cutoffIso, limit, excludeIds) {
      const id = await source();
      if (!id) return [];
      // Excluded ids are filtered here: a long NOT IN list would overflow the request URL.
      const skip = new Set(excludeIds);
      const { data, error } = await db
        .from("signals")
        .select("id, external_id, engagement")
        .eq("source_id", id)
        .lt("collected_at", cutoffIso)
        .not("external_id", "is", null)
        .order("collected_at", { ascending: true })
        .limit(limit + skip.size);
      if (error) throw error;
      return ((data ?? []) as { id: string; external_id: string; engagement: Record<string, unknown> }[])
        .filter((r) => !skip.has(r.id))
        .slice(0, limit);
    },
    async update(id, patch) {
      const { error } = await db.from("signals").update(patch).eq("id", id);
      if (error) throw error;
    },
    async remove(ids) {
      const { error } = await db.from("signals").delete().in("id", ids);
      if (error) throw error;
    },
  };
}
