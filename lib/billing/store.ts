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
      // One transaction in stub_change_plan (migration 16): the plan flip and its log row commit together.
      const { error } = await db.rpc("stub_change_plan", { p_user: c.userId, p_from: c.fromPlan, p_to: c.toPlan });
      if (error) throw new Error(error.message);
    },
  };
}
