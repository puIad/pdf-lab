// lib/evidence/service-deps.ts — Production service-role dependencies for Evidence writer.
// Import ONLY from server code (route handlers / orchestrator); never from client or unit tests.

import { createServiceSupabaseClient } from "../db/client.ts";
import type { EvidenceWriterDeps } from "./writer.ts";
import type { EvidenceRow } from "./types.ts";

export function createServerEvidenceDeps(): EvidenceWriterDeps {
  return {
    insertEvidence: async (rows) => {
      if (rows.length === 0) return [];
      const supabase = createServiceSupabaseClient();
      const { data, error } = await supabase
        .from("evidence")
        .insert(rows)
        .select("id, entity_type, entity_id, source_id, claim, excerpt, url, created_at");

      if (error) {
        throw new Error(`Failed to insert evidence: ${error.message}`);
      }

      return (data ?? []) as EvidenceRow[];
    },
  };
}
