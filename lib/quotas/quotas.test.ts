// lib/quotas/quotas.test.ts — Phase 5 Part 5.1 acceptance: anon over-limit blocked, a free
// plan's second Deep run in a month blocked, counters reset with the window.

import assert from "node:assert/strict";
import test from "node:test";
import { decide, LIMITS, windowEnd, windowStart, type Caller, type UsageKind, type UsageStore } from "./quotas.ts";

/** In-memory stand-in for the usage_events table. `now` is the clock the rows are stamped with. */
function memoryStore(clock: { now: Date }): UsageStore & { rows: Array<{ id: string; who: string; kind: UsageKind; at: Date }> } {
  const who = (c: Caller) => c.userId ?? c.anonHash ?? "";
  const rows: Array<{ id: string; who: string; kind: UsageKind; at: Date }> = [];
  let next = 0;
  return {
    rows,
    count: async (c, kind, since) => rows.filter((r) => r.who === who(c) && r.kind === kind && r.at >= since).length,
    record: async (c, kind) => {
      const id = `row-${++next}`;
      rows.push({ id, who: who(c), kind, at: clock.now });
      return id;
    },
    remove: async (id) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

const anon: Caller = { plan: "anon", userId: null, anonHash: "hash-a", email: null };
const free: Caller = { plan: "free", userId: "user-1", anonHash: null, email: "a@example.com" };
const at = (iso: string) => new Date(iso);

test("windows start and end on UTC day and month boundaries", () => {
  const now = at("2026-11-16T23:30:00Z");
  assert.equal(windowStart("day", now).toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(windowEnd("day", now).toISOString(), "2026-11-17T00:00:00.000Z");
  assert.equal(windowStart("month", now).toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(windowEnd("month", at("2026-12-31T23:59:59Z")).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("a signed-out caller gets 3 searches a day, then 429 with the reset time; the next day counts from zero", async () => {
  const clock = { now: at("2026-11-16T10:00:00Z") };
  const store = memoryStore(clock);
  for (let i = 1; i <= LIMITS.anon.search.max; i++) {
    const d = await decide(anon, "search", store, clock.now);
    assert.ok(d.ok);
    assert.equal(d.quota?.remaining, LIMITS.anon.search.max - i);
  }
  const blocked = await decide(anon, "search", store, clock.now);
  assert.ok(!blocked.ok);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.quota?.remaining, 0);
  assert.equal(blocked.quota?.resetsAt, "2026-11-17T00:00:00.000Z");
  assert.match(blocked.error, /3 of 3 searches used this day\. Resets 17 November 2026/);
  assert.equal(store.rows.length, 3); // a blocked call is not recorded

  // Another signed-out caller has their own count.
  assert.ok((await decide({ ...anon, anonHash: "hash-b" }, "search", store, clock.now)).ok);

  clock.now = at("2026-11-17T00:00:01Z");
  const next = await decide(anon, "search", store, clock.now);
  assert.ok(next.ok);
  assert.equal(next.quota?.used, 1);
});

test("a signed-out caller is told to sign in for scans, checks and Deep runs; nothing is counted", async () => {
  const clock = { now: at("2026-11-16T10:00:00Z") };
  const store = memoryStore(clock);
  for (const kind of ["exploration", "check", "deep"] as const) {
    const d = await decide(anon, kind, store, clock.now);
    assert.ok(!d.ok);
    assert.equal(d.status, 401);
    assert.match(d.error, /^Sign in to use /);
  }
  assert.equal(store.rows.length, 0);
});

test("free plan: the second Deep run in a month is blocked, the first of next month is allowed", async () => {
  const clock = { now: at("2026-11-03T09:00:00Z") };
  const store = memoryStore(clock);
  assert.ok((await decide(free, "deep", store, clock.now)).ok);

  clock.now = at("2026-11-30T23:59:00Z");
  const second = await decide(free, "deep", store, clock.now);
  assert.ok(!second.ok);
  assert.equal(second.status, 429);
  assert.equal(second.quota?.resetsAt, "2026-12-01T00:00:00.000Z");
  assert.match(second.error, /Free plan limit reached: 1 of 1 Deep runs used this month/);

  // A Deep run does not use up the scans, and the other way round.
  assert.ok((await decide(free, "exploration", store, clock.now)).ok);

  clock.now = at("2026-12-01T00:00:00Z");
  assert.ok((await decide(free, "deep", store, clock.now)).ok);
});

test("free plan: 5 idea scans a month", async () => {
  const clock = { now: at("2026-11-16T10:00:00Z") };
  const store = memoryStore(clock);
  for (let i = 0; i < 5; i++) assert.ok((await decide(free, "exploration", store, clock.now)).ok);
  assert.equal((await decide(free, "exploration", store, clock.now)).ok, false);
  assert.ok((await decide({ ...free, plan: "premium" }, "exploration", store, clock.now)).ok); // same person, upgraded
});

test("the server key is never counted; a pipeline endpoint refuses everyone else", async () => {
  const clock = { now: at("2026-11-16T10:00:00Z") };
  const store = memoryStore(clock);
  const internal: Caller = { plan: "internal", userId: null, anonHash: null, email: null };
  const local: Caller = { plan: "local", userId: null, anonHash: null, email: null };
  assert.deepEqual(await decide(internal, "internal", store, clock.now), { ok: true, quota: null, usageId: null });
  assert.deepEqual(await decide(internal, "deep", store, clock.now), { ok: true, quota: null, usageId: null });
  assert.deepEqual(await decide(local, "deep", store, clock.now), { ok: true, quota: null, usageId: null });
  for (const caller of [anon, free, local]) {
    const d = await decide(caller, "internal", store, clock.now);
    assert.ok(!d.ok);
    assert.equal(d.status, 401);
  }
  assert.equal(store.rows.length, 0);
});

test("a refunded Deep run gives the month's run back", async () => {
  const clock = { now: at("2026-11-16T10:00:00Z") };
  const store = memoryStore(clock);
  const first = await decide(free, "deep", store, clock.now);
  assert.ok(first.ok && first.usageId);
  assert.equal((await decide(free, "deep", store, clock.now)).ok, false);
  // The run failed while collecting: the route removes the row it was counted under.
  await store.remove(first.usageId);
  const again = await decide(free, "deep", store, clock.now);
  assert.ok(again.ok);
  assert.equal(again.quota?.remaining, 0);
  assert.equal(store.rows.length, 1);
});
