// lib/privacy/account-data.ts — what a person can take out of PDF Lab and the words that confirm
// deleting it (Phase 6 Part 6.3). Pure: the route reads the rows, this shapes and checks them.

export const DELETE_CONFIRMATION = "delete my account";

/** Tables that hold a person's own rows, and the columns an export may carry (never anon hashes or ids of others). */
export const EXPORT_TABLES = {
  usage_events: "kind, created_at",
  watchlists: "kind, ref, region, seed, created_at",
  metric_events: "kind, subject_type, subject_ref, value, created_at",
  research_runs: "id, query, mode, status, started_at, completed_at",
  ai_usage_ledger: "run_id, provider, model, tier, key_source, total_tokens, estimated_cost_usd, created_at",
  plan_changes: "from_plan, to_plan, source, charged_cents, created_at",
  // Key metadata only. Never `ciphertext`: the export must not carry key material, even encrypted.
  user_provider_keys: "provider, last4, options, status, created_at, rotated_at",
} as const;

export type ExportTable = keyof typeof EXPORT_TABLES;

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
