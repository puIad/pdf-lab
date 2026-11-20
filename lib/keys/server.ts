// lib/keys/server.ts: Supabase-backed stores and the one call routes use to get a router for a person.
// Server-only: it uses the service-role client and the vault secret.

import { createServiceSupabaseClient } from "../db/client.ts";
import type { LedgerRow, LedgerStore } from "../usage/ledger.ts";
import { vaultSecret } from "./crypto.ts";
import { createUserRouter, type UserRouter } from "./user-router.ts";
import type { ByokProvider, KeyOptions, KeyRow, KeyStore } from "./vault.ts";

interface DbKey {
  user_id: string;
  provider: ByokProvider;
  ciphertext: string;
  last4: string;
  options: KeyOptions;
  status: "active" | "revoked";
  status_detail: string | null;
  created_at: string;
  rotated_at: string | null;
}

const fromDb = (r: DbKey): KeyRow => ({
  userId: r.user_id,
  provider: r.provider,
  ciphertext: r.ciphertext,
  last4: r.last4,
  options: r.options ?? {},
  status: r.status,
  statusDetail: r.status_detail,
  createdAt: r.created_at,
  rotatedAt: r.rotated_at,
});

export function supabaseKeyStore(): KeyStore {
  const db = createServiceSupabaseClient();
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    async get(userId, provider) {
      const { data, error } = await db.from("user_provider_keys").select("*").eq("user_id", userId).eq("provider", provider).maybeSingle();
      fail(error);
      return data ? fromDb(data as DbKey) : null;
    },
    async list(userId) {
      const { data, error } = await db.from("user_provider_keys").select("*").eq("user_id", userId).order("created_at");
      fail(error);
      return ((data ?? []) as DbKey[]).map(fromDb);
    },
    async put(row) {
      const { error } = await db.from("user_provider_keys").upsert(
        {
          user_id: row.userId,
          provider: row.provider,
          ciphertext: row.ciphertext,
          last4: row.last4,
          options: row.options,
          status: row.status,
          status_detail: row.statusDetail,
          created_at: row.createdAt,
          rotated_at: row.rotatedAt,
        },
        { onConflict: "user_id,provider" },
      );
      fail(error);
    },
    async remove(userId, provider) {
      const { data, error } = await db.from("user_provider_keys").delete().eq("user_id", userId).eq("provider", provider).select("provider");
      fail(error);
      return (data ?? []).length > 0;
    },
    async setStatus(userId, provider, status, detail) {
      const { error } = await db.from("user_provider_keys").update({ status, status_detail: detail }).eq("user_id", userId).eq("provider", provider);
      fail(error);
    },
  };
}

export function supabaseLedgerStore(): LedgerStore {
  const db = createServiceSupabaseClient();
  return {
    async insert(r: LedgerRow) {
      const { error } = await db.from("ai_usage_ledger").insert({
        user_id: r.userId,
        run_id: r.runId,
        provider: r.provider,
        model: r.model,
        tier: r.tier,
        key_source: r.keySource,
        prompt_tokens: r.promptTokens,
        completion_tokens: r.completionTokens,
        total_tokens: r.totalTokens,
        estimated_cost_usd: r.estimatedCostUsd,
        cost_basis: r.costBasis,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/** The router for one request: the person's keys first, then the hosted quota; every call goes to the ledger. */
export function routerForUser(userId: string | null): Promise<UserRouter> {
  return createUserRouter({ userId, keys: supabaseKeyStore(), ledger: supabaseLedgerStore(), secret: () => vaultSecret() });
}
