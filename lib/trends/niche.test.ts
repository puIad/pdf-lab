import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNicheTrendOfRun, fetchNicheTrends, nicheTrendLine, summarizeNicheTrend } from "./niche.ts";

const iot = { avg_interest: 46, direction: "falling", points: 13, window_days: 90 };

test("summarizes the interest-over-time row, ignoring related queries and other sources", () => {
  const t = summarizeNicheTrend("r1", "pc troubleshooting", [
    { url: "u", engagement: iot, sources: { type: "gtrends" } },
    { url: "x", engagement: { seed: "pc troubleshooting", related_query: "a", interest_value: 80, rising: false }, sources: { type: "gtrends" } },
    { url: "y", engagement: { avg_interest: 99, seed: "s" }, sources: [{ type: "reddit" }] },
  ]);
  assert.equal(t?.count, 1);
  assert.equal(t?.avgInterest, 46);
  assert.equal(t?.direction, "falling");
  assert.match(nicheTrendLine(t!), /not a market's trend/);
});

test("no reading, no claim", () => {
  assert.equal(summarizeNicheTrend("r1", "pc troubleshooting", [{ url: null, engagement: { upvotes: 3 }, sources: { type: "reddit" } }]), null);
});

test("mixed directions across windows are reported as mixed, not flat", () => {
  const t = summarizeNicheTrend("r1", "s", [
    { url: "u", engagement: iot, sources: { type: "gtrends" } },
    { url: "v", engagement: { ...iot, direction: "rising" }, sources: { type: "gtrends" } },
  ]);
  assert.equal(t?.direction, "mixed");
});

test("a seed is shown only to the run's owner", async () => {
  const supabase = {
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        range: () => b,
        maybeSingle: async () => ({ data: { query: "secret seed", user_id: "owner" } }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === "run_signals" ? [{ run_id: "r1", signals: { url: "u", engagement: iot, sources: { type: "gtrends" } } }] : [], error: null }),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  assert.equal(await fetchNicheTrendOfRun(supabase, "r1", { plan: "free", userId: "other" }), null);
  assert.equal(await fetchNicheTrendOfRun(supabase, "r1", { plan: "anon", userId: null }), null);
  assert.equal(await fetchNicheTrendOfRun(supabase, "r1", null), null);
  assert.equal((await fetchNicheTrendOfRun(supabase, "r1", { plan: "free", userId: "owner" }))?.seed, "secret seed");
  assert.equal((await fetchNicheTrendOfRun(supabase, "r1", { plan: "internal", userId: null }))?.seed, "secret seed");
});

test("a failed query returns no trends instead of throwing", async () => {
  const supabase = { from: () => { const b: Record<string, unknown> = { select: () => b, in: () => b, then: (r: (v: unknown) => void) => r({ data: null, error: { message: "boom" } }) }; return b; } } as unknown as SupabaseClient;
  const log = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await fetchNicheTrends(supabase, [{ id: "r1", query: "s" }]), []);
  } finally {
    console.error = log;
  }
});
