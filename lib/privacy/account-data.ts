// lib/privacy/account-data.ts — what a person can take out of PDF Lab and the words that confirm
// deleting it (Phase 6 Part 6.3). Reads one person's rows, shapes them, and checks the delete phrase.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "../db/read-all.ts";

export const DELETE_CONFIRMATION = "delete my account";

/** Tables that hold a person's own rows, and the columns an export may carry (never anon hashes or ids of others). */
export const EXPORT_TABLES = {
  usage_events: "kind, created_at",
  watchlists: "kind, ref, region, seed, created_at",
  metric_events: "kind, subject_type, subject_ref, value, created_at",
  research_runs: "id, query, mode, status, started_at, completed_at",
  ai_usage_ledger: "run_id, provider, model, tier, key_source, total_tokens, estimated_cost_usd, created_at",
  plan_changes: "from_plan, to_plan, source, charged_cents, created_at",
  alert_settings: "watch_id, threshold, muted, updated_at",
  alerts: "kind, seed, region, title, detail, created_at, read_at",
  // Key metadata only. Never `ciphertext`: the export must not carry key material, even encrypted.
  user_provider_keys: "provider, last4, options, status, created_at, rotated_at",
} as const;

export type ExportTable = keyof typeof EXPORT_TABLES;

/** The unique column that orders each table's rows for paging, within one user's rows. Every other table has `id`. */
export const EXPORT_ORDER: Partial<Record<ExportTable, string>> = { alert_settings: "watch_id", user_provider_keys: "provider" };

/**
 * Every row of the person's own tables, paged past the 1000-row response cap and scoped by `user_id`.
 * An unreadable table fails the whole export, never a partial file.
 */
export async function loadExportRows(db: SupabaseClient, userId: string): Promise<Partial<Record<ExportTable, unknown[]>>> {
  const rows: Partial<Record<ExportTable, unknown[]>> = {};
  for (const table of Object.keys(EXPORT_TABLES) as ExportTable[]) {
    rows[table] = await readAll(table, () => db.from(table).select(EXPORT_TABLES[table]).eq("user_id", userId).order(EXPORT_ORDER[table] ?? "id"));
  }
  return rows;
}

export interface AccountExport {
  exportedAt: string;
  account: { email: string | null; plan: string | null; createdAt: string | null };
  data: Record<ExportTable, unknown[]>;
  note: string;
}

export function buildExport(
  now: Date,
  account: { email: string | null; plan: string | null; createdAt: string | null },
  rows: Partial<Record<ExportTable, unknown[]>>,
): AccountExport {
  const data = Object.fromEntries((Object.keys(EXPORT_TABLES) as ExportTable[]).map((t) => [t, rows[t] ?? []])) as Record<ExportTable, unknown[]>;
  return {
    exportedAt: now.toISOString(),
    account,
    data,
    note: "Your own rows only. Market data PDF Lab collected from public sources is not personal data and is not included.",
  };
}

/** True when a delete request's body carries the confirmation phrase (case and spacing ignored). */
export function isDeleteConfirmed(body: unknown): boolean {
  const c = (body as { confirm?: unknown } | null)?.confirm;
  return typeof c === "string" && c.trim().replace(/\s+/g, " ").toLowerCase() === DELETE_CONFIRMATION;
}
