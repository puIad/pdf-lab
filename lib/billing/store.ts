// lib/billing/store.ts: BillingStore over Supabase (service role). Part 5.3.

import { createServiceSupabaseClient } from "@/lib/db/client";
import type { BillingStore, PlanName } from "./stub";

export function billingStore(): BillingStore {
  const db = createServiceSupabaseClient();
  return {
    async currentPlan(userId) {
      const { data, error } = await db.from("users").select("plan").eq("id", userId).single();
      if (error) throw new Error(error.message);
      return (data.plan === "premium" ? "premium" : "free") as PlanName;
    },
    async apply(c) {
      const { error: e1 } = await db.from("users").update({ plan: c.toPlan }).eq("id", c.userId);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await db
        .from("plan_changes")
        .insert({ user_id: c.userId, from_plan: c.fromPlan, to_plan: c.toPlan, source: c.source, charged_cents: c.chargedCents });
      if (e2) throw new Error(e2.message);
    },
  };
}
