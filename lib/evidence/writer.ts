// lib/evidence/writer.ts — Evidence persistence and querying per docs/04-SCHEMA.md & docs/06-EVIDENCE-CONTRACT.md.
// NOTE: Kept decoupled from next/headers so unit tests run cleanly without nextjs runtime.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityType, EvidenceInput, EvidenceRow } from "./types.ts";
import { formatEvidenceClaim } from "./types.ts";

export interface EvidenceWriterDeps {
  insertEvidence: (rows: Omit<EvidenceRow, "id">[]) => Promise<EvidenceRow[]>;
}

/**
 * Writes one or more evidence records to the evidence table.
 * Formats the claim with signalType and confidence metadata when provided.
 */
export async function writeEvidence(
  items: EvidenceInput[],
  deps: EvidenceWriterDeps,
): Promise<EvidenceRow[]> {
  if (items.length === 0) return [];

  const rowsToInsert: Omit<EvidenceRow, "id">[] = items.map((item) => {
    if (!item.entityType || !item.entityId) {
      throw new Error("Evidence item missing entityType or entityId");
    }
    if (!item.claim || item.claim.trim().length === 0) {
      throw new Error("Evidence item missing claim text");
    }

    const claim = formatEvidenceClaim(
      item.claim,
      item.signalType,
      item.confidence,
    );

    return {
      entity_type: item.entityType,
      entity_id: item.entityId,
      source_id: item.sourceId ?? null,
      claim,
      excerpt: item.excerpt ?? null,
      url: item.url ?? null,
      created_at: item.createdAt || new Date().toISOString(),
    };
  });

  return deps.insertEvidence(rowsToInsert);
}

/**
 * Retrieves all evidence rows supporting a specific entity (market, opportunity, trend, competition).
 */
export async function getEvidenceForEntity(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
): Promise<EvidenceRow[]> {
  const { data, error } = await supabase
    .from("evidence")
    .select("id, entity_type, entity_id, source_id, claim, excerpt, url, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch evidence for ${entityType}:${entityId}: ${error.message}`);
  }

  return (data ?? []) as EvidenceRow[];
}

/**
 * Counts evidence rows grouped by entityId for a list of entity IDs.
 */
export async function countEvidenceForEntities(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityIds: string[],
): Promise<Record<string, number>> {
  if (entityIds.length === 0) return {};

  const { data, error } = await supabase
    .from("evidence")
    .select("entity_id")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds);

  if (error) {
    throw new Error(`Failed to count evidence for ${entityType}: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  for (const id of entityIds) {
    counts[id] = 0;
  }
  for (const row of (data ?? []) as Array<{ entity_id: string }>) {
    counts[row.entity_id] = (counts[row.entity_id] || 0) + 1;
  }
  return counts;
}
