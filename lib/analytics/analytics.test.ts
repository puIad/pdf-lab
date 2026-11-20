// lib/analytics/analytics.test.ts — Part 6.2 acceptance: a save writes an event row, a repeat does
// not, and the north star is computed from rows (never from searches).

import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMetrics, parseVote, returnEvent, savedEvent, voteEvent } from "./metrics.ts";
import { recordEvent } from "./store.ts";

/** In-memory metric_events honouring upsert onConflict / ignoreDuplicates like Postgres. */
function fakeDb() {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    from: (table: string) => {
      assert.equal(table, "metric_events");
      return {
        insert: async (row: Record<string, unknown>) => (rows.push(row), { error: null }),
        upsert: async (row: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates: boolean }) => {
          const i = rows.findIndex((r) => r[opts.onConflict] === row[opts.onConflict]);
          if (i === -1) rows.push(row);
          else if (!opts.ignoreDuplicates) rows[i] = row;
          return { error: null };
        },
      };
    },
  };
  return { rows, db: db as unknown as SupabaseClient };
}

const watch = { kind: "idea" as const, ref: "budget planner", region: "us" };

test("saving writes one event row; saving the same thing again writes no second row", async () => {
  const { rows, db } = fakeDb();
  await recordEvent(db, savedEvent("u1", watch));
  await recordEvent(db, savedEvent("u1", watch));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "saved");
  assert.equal(rows[0].user_id, "u1");
  assert.equal(rows[0].subject_ref, "budget planner");
});

test("a second vote replaces the first", async () => {
  const { rows, db } = fakeDb();
  await recordEvent(db, voteEvent("u1", "opp", true));
  await recordEvent(db, voteEvent("u1", "opp", false));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 0);
});

test("a person returns once per UTC day", () => {
  const a = returnEvent("u1", new Date("2026-11-20T01:00:00Z"));
  const b = returnEvent("u1", new Date("2026-11-20T23:00:00Z"));
  const c = returnEvent("u1", new Date("2026-11-21T00:00:01Z"));
  assert.equal(a.dedupeKey, b.dedupeKey);
  assert.notEqual(a.dedupeKey, c.dedupeKey);
});

test("parseVote rejects bad bodies", () => {
  assert.ok("error" in parseVote({ opportunityId: "nope", useful: true }));
  assert.ok("error" in parseVote({ opportunityId: "0a1b2c3d-0000-4000-8000-000000000001", useful: "yes" }));
  assert.deepEqual(parseVote({ opportunityId: "0A1B2C3D-0000-4000-8000-000000000001", useful: false }), {
    opportunityId: "0a1b2c3d-0000-4000-8000-000000000001",
    useful: false,
  });
});

test("north star counts validated opportunities per active user, not searches", () => {
  const m = computeMetrics({
    opportunities: [
      { id: "a", runUserId: "u1", sourcedEvidence: 3 },
      { id: "b", runUserId: "u1", sourcedEvidence: 1 },
      { id: "c", runUserId: "u2", sourcedEvidence: 0 }, // no evidence: not validated
      { id: "d", runUserId: null, sourcedEvidence: 2 },
    ],
    activeUserIds: ["u1", "u1", "u2", "u3"],
    events: [
      { kind: "saved", userId: "u1", value: null },
      { kind: "useful_vote", userId: "u1", value: 1 },
      { kind: "useful_vote", userId: "u2", value: 0 },
      { kind: "research_to_creation", userId: "u1", value: null },
      { kind: "research_to_creation", userId: "u9", value: null }, // never discovered anything
      { kind: "monitor_return", userId: "u1", value: null },
      { kind: "new_market", userId: "u1", value: null },
    ],
  });
  assert.equal(m.validatedOpportunities, 3);
  assert.equal(m.activeUsers, 3);
  assert.equal(m.northStar, 1);
  assert.deepEqual(m.coverage, { opportunities: 4, withEvidence: 3, share: 0.75 });
  assert.deepEqual(m.votes, { useful: 1, notUseful: 1 });
  assert.deepEqual(m.conversion, { discoverers: 1, creators: 1, share: 1 });
  assert.equal(m.saved, 1);
  assert.equal(m.newMarkets, 1);
  assert.deepEqual(m.returns, { events: 1, people: 1 });
});

test("with no active user the north star is not observed, never zero or infinity", () => {
  const m = computeMetrics({ opportunities: [{ id: "a", runUserId: "u1", sourcedEvidence: 1 }], activeUserIds: [], events: [] });
  assert.equal(m.northStar, null);
  assert.equal(m.coverage.share, 1);
  assert.equal(computeMetrics({ opportunities: [], activeUserIds: [], events: [] }).coverage.share, null);
});
