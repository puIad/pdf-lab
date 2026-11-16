// lib/quotas/guard.ts — who is calling, and the quota check every costly endpoint runs first
// (Phase 5 Part 5.1). Server-only: it reads the session cookies and uses the service-role client.

import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/db/client";
import { decide, type Caller, type QuotaState, type UsageKind, type UsageStore } from "./quotas.ts";

/** The server key, a signed-in user, a signed-out visitor (by hashed IP), or a local dev server. */
export async function resolveCaller(headers: Headers): Promise<Caller> {
  const key = process.env.INTERNAL_API_KEY;
  if (key && headers.get("x-api-key") === key) return { plan: "internal", userId: null, anonHash: null, email: null };

  const { data } = await (await createServerSupabaseClient()).auth.getClaims();
  const userId = data?.claims.sub;
  if (userId) {
    const { data: row } = await createServiceSupabaseClient().from("users").select("plan").eq("id", userId).maybeSingle();
    const email = typeof data.claims.email === "string" ? data.claims.email : null;
    return { plan: row?.plan === "premium" ? "premium" : "free", userId, anonHash: null, email };
  }

  // A signed-out caller on a dev server is the developer: open, as before Phase 5.
  if (process.env.NODE_ENV !== "production") return { plan: "local", userId: null, anonHash: null, email: null };

  // Vercel sets x-forwarded-for itself, so the first address is the client's and cannot be forged.
  const ip = headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const anonHash = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(ip).digest("hex");
  return { plan: "anon", userId: null, anonHash, email: null };
}

export function usageStore(): UsageStore {
  const db = createServiceSupabaseClient();
  return {
    async count(caller, kind, since) {
      const q = db.from("usage_events").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since.toISOString());
      const { count, error } = await (caller.userId ? q.eq("user_id", caller.userId) : q.eq("anon_hash", caller.anonHash ?? ""));
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async record(caller, kind) {
      const { data, error } = await db
        .from("usage_events")
        .insert({ user_id: caller.userId, anon_hash: caller.userId ? null : caller.anonHash, kind })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async remove(id) {
      const { error } = await db.from("usage_events").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

export interface Guarded {
  caller: Caller;
  /** The caller's quota after this action; null when the caller is not counted. */
  quota: QuotaState | null;
  /** The usage row this action recorded; null when nothing was counted. */
  usageId: string | null;
  /** Set when the action is refused: the reason, and the same reason as a JSON response. */
  error: string | null;
  denied: NextResponse | null;
}

/**
 * Run at the top of every endpoint that spends something. `kind` names what is counted;
 * `internal` marks a pipeline endpoint only the server key may call.
 * shortcut: check then insert, so two requests in the same instant can both pass at the limit;
 * move the count into one SQL statement if that is ever abused.
 */
export async function enforceQuota(headers: Headers, kind: UsageKind | "internal"): Promise<Guarded> {
  let caller: Caller = { plan: "anon", userId: null, anonHash: null, email: null };
  try {
    caller = await resolveCaller(headers);
    const d = await decide(caller, kind, usageStore());
    if (d.ok) return { caller, quota: d.quota, usageId: d.usageId, error: null, denied: null };
    return { caller, quota: d.quota, usageId: null, error: d.error, denied: NextResponse.json({ error: d.error, quota: d.quota }, { status: d.status }) };
  } catch (err) {
    // The quota could not be read: refuse, do not run uncounted.
    const error = `Could not check your usage limit: ${err instanceof Error ? err.message : String(err)}`;
    return { caller, quota: null, usageId: null, error, denied: NextResponse.json({ error }, { status: 503 }) };
  }
}

/**
 * Gives back an action counted by enforceQuota when the work then failed: the caller got nothing,
 * so it should not use up their limit (a free plan has one Deep run a month). Call it on every
 * error return after the guard. A failed refund is logged, never thrown over the real error.
 */
export async function refund(guard: Guarded): Promise<void> {
  if (!guard.usageId) return;
  try {
    await usageStore().remove(guard.usageId);
  } catch (err) {
    console.error(`Could not refund usage row ${guard.usageId}:`, err);
  }
}

/** For a run's follow-up requests: the server key, a dev server, or the person who started the run. */
export function ownsRun(caller: Caller, runUserId: string | null): boolean {
  return caller.plan === "internal" || caller.plan === "local" || (caller.userId !== null && caller.userId === runUserId);
}
