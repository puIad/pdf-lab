// lib/settings/extraction-mode.ts — where the extraction mode is stored (table app_settings,
// migration 15). Server-only: the service-role client reads and writes it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseExtractionMode, type ExtractionMode } from "../ai/extraction-mode.ts";

export const EXTRACTION_MODE_KEY = "extraction_mode";

/** The saved mode, or `null` when none was chosen yet (the router then uses its tier defaults). */
export async function loadExtractionMode(db: SupabaseClient): Promise<ExtractionMode | null> {
  const { data, error } = await db.from("app_settings").select("value").eq("key", EXTRACTION_MODE_KEY).maybeSingle();
  if (error) throw new Error(`Could not read the extraction mode: ${error.message}`);
  return parseExtractionMode(data?.value);
}

export async function saveExtractionMode(db: SupabaseClient, mode: ExtractionMode): Promise<void> {
  const { error } = await db
    .from("app_settings")
    .upsert({ key: EXTRACTION_MODE_KEY, value: mode, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Could not save the extraction mode: ${error.message}`);
}

/** What `runExtractionJob` gets from the saved mode: the pinned provider and model, or nothing. */
export function extractionPin(mode: ExtractionMode | null): { providerName?: string; model?: string } {
  return mode?.kind === "model" ? { providerName: mode.provider, model: mode.model } : {};
}

/**
 * For a Deep entry point that runs extraction through the router: the answer when the saved mode
 * is pasted replies, so no model is called and the caller sends the user to /deep.
 */
export function pastedModeRefusal(mode: ExtractionMode | null): { error: string; deepPath: string } | null {
  if (mode?.kind !== "pasted") return null;
  return {
    error: "The extraction mode is pasted replies, so no model is called here. Use the Deep research page.",
    deepPath: "/deep",
  };
}
