// lib/billing/billing.test.ts: Part 5.3 acceptance. A stub upgrade changes the limits, the change
// is logged, and no real charge is possible.

import assert from "node:assert/strict";
import test from "node:test";
import { BILLING_MODE, changePlan, charge, stubAllowed, type BillingStore, type PlanChange, type PlanName } from "./stub.ts";
import { decide, LIMITS, type Caller, type UsageStore } from "../quotas/quotas.ts";

function memory(plan: PlanName) {
  const state = { plan, log: [] as PlanChange[] };
  const store: BillingStore = {
    currentPlan: async () => state.plan,
    apply: async (c) => {
      state.plan = c.toPlan;
      state.log.push(c);
    },
  };
  return { state, store };
}

test("a stub upgrade flips the plan, logs it, and the limits change", async () => {
  const { state, store } = memory("free");
  const usage: UsageStore = { count: async () => 0, take: async () => ({ usageId: "u", used: 1 }), remove: async () => {} };
  const caller = (plan: PlanName): Caller => ({ plan, userId: "u1", anonHash: null, email: null });
  const before = await decide(caller(state.plan), "deep", usage);
  assert.equal(before.ok && before.quota?.limit, LIMITS.free.deep.max);

  const change = await changePlan(store, "u1", "premium");
  assert.deepEqual(change, { userId: "u1", fromPlan: "free", toPlan: "premium", source: "stub", chargedCents: 0 });
  assert.equal(state.log.length, 1);
  const after = await decide(caller(state.plan), "deep", usage);
  assert.equal(after.ok && after.quota?.limit, LIMITS.premium.deep.max);
  assert.ok(LIMITS.premium.deep.max > LIMITS.free.deep.max);
});

test("changing to the current plan logs nothing", async () => {
  const { state, store } = memory("premium");
  assert.equal(await changePlan(store, "u1", "premium"), null);
  assert.equal(state.log.length, 0);
});

test("no real charge is possible in stub mode", async () => {
  assert.equal(BILLING_MODE, "stub");
  assert.throws(() => charge(), /stub mode/);
  const { state, store } = memory("free");
  await changePlan(store, "u1", "premium");
  assert.ok(state.log.every((c) => c.chargedCents === 0 && c.source === "stub"));
});

test("the stub is closed in production unless switched on", () => {
  assert.equal(stubAllowed({ NODE_ENV: "development" }), true);
  assert.equal(stubAllowed({ NODE_ENV: "production" }), false);
  assert.equal(stubAllowed({ NODE_ENV: "production", BILLING_STUB_ENABLED: "1" }), true);
});
