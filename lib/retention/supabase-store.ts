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
    async listStale(cutoffIso, limit) {
      const id = await source();
      if (!id) return [];
      const { data, error } = await db
        .from("signals")
        .select("id, external_id, url, engagement")
        .eq("source_id", id)
        .lt("collected_at", cutoffIso)
        .not("external_id", "is", null)
        .order("collected_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as { id: string; external_id: string; url: string; engagement: Record<string, unknown> }[];
    },
    async removeStaleEvidence(cutoffIso) {
      const id = await source();
      if (!id) return 0;
      const { data, error } = await db
        .from("evidence")
        .delete()
        .eq("source_id", id)
        .lt("created_at", cutoffIso)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    async removeEvidenceByUrl(urls) {
      const id = await source();
      if (!id || urls.length === 0) return 0;
      const { data, error } = await db.from("evidence").delete().eq("source_id", id).in("url", urls).select("id");
      if (error) throw error;
      return data?.length ?? 0;
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
