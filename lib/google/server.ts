// lib/google/server.ts: the Supabase-backed token store. Server-only (service-role client).

import { createServiceSupabaseClient } from "../db/client.ts";
import type { GoogleTokenStore } from "./oauth.ts";

export function supabaseGoogleTokenStore(): GoogleTokenStore {
  const db = createServiceSupabaseClient();
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    async get(userId) {
      const { data, error } = await db.from("user_google_tokens").select("ciphertext").eq("user_id", userId).maybeSingle();
      fail(error);
      return data?.ciphertext ?? null;
    },
    async put(userId, ciphertext) {
      const { error } = await db.from("user_google_tokens").upsert({ user_id: userId, ciphertext, created_at: new Date().toISOString() }, { onConflict: "user_id" });
      fail(error);
    },
    async remove(userId) {
      const { data, error } = await db.from("user_google_tokens").delete().eq("user_id", userId).select("user_id");
      fail(error);
      return (data ?? []).length > 0;
    },
  };
}
