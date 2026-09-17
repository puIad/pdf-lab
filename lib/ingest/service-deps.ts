// lib/ingest/service-deps.ts — server-only IngestDeps wiring (service-role).
// Split from pipeline.ts so `pnpm test` (plain node, no Next runtime) never
// loads `next/headers` through lib/db/client.ts. Import ONLY from server code
// (route handlers); never from client components or unit tests.

import { listAdapters } from "../sources/registry.ts";
import { createServiceSupabaseClient } from "../db/client.ts";
import type { IngestDeps } from "./pipeline.ts";

export function getServiceDeps(): IngestDeps {
  const supabase = createServiceSupabaseClient();
  return {
    adapters: listAdapters(),
    resolveSourceId: async (adapterKey) => {
      const { data, error } = await supabase
        .from("sources")
        .select("id")
        .eq("type", adapterKey)
        .maybeSingle();
      if (error) throw new Error(`sources lookup failed: ${error.message}`);
      return (data?.id as string | undefined) ?? null;
    },
    upsertSignals: async (rows) => {
      const { data, error } = await supabase
        .from("signals")
        .upsert(rows, { onConflict: "source_id,external_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`signals upsert failed: ${error.message}`);
      return data?.length ?? 0;
    },
  };
}
