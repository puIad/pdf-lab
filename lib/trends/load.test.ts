import test from "node:test";
import assert from "node:assert/strict";
import { loadStoredMarketTopics } from "./load.ts";

const DAY = 86_400_000;
const iso = (d: number) => new Date(Date.now() - d * DAY).toISOString();

function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from: (t: string) => {
      const q = { select: () => q, in: () => q, limit: () => q, order: () => q, range: () => q, then: (r: (v: unknown) => void) => r({ data: tables[t] ?? [], error: null }) };
      return q;
    },
  } as never;
}

const sig = (id: string, extra: Record<string, unknown> = {}) => ({
  signals: { id, external_id: id, url: "https://x/" + id, title: "t", content: "c", published_at: iso(2), engagement: {}, sources: { type: "reddit" }, signal_analysis: { intent: "strong", urgency: null }, ...extra },
});

test("loads only dated discussion rows and drops markets with none", async () => {
  const topics = await loadStoredMarketTopics(
    fakeSupabase({
      markets: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }],
      market_signals: [
        { market_id: "m1", ...sig("ok") },
        { market_id: "m1", ...sig("undated", { published_at: null }) },
        { market_id: "m1", ...sig("w", { sources: { type: "wikipedia" } }) },
        { market_id: "m2", ...sig("serp:q") },
      ],
      competitors: [{ market_id: "m1" }, { market_id: "m1" }],
    }),
  );
  assert.equal(topics.length, 1);
  assert.equal(topics[0].id, "m1");
  assert.deepEqual(topics[0].signals.map((s) => s.id), ["ok"]);
  assert.equal(topics[0].competitorCount, 2);
});

test("no stored markets gives no topics", async () => {
  assert.deepEqual(await loadStoredMarketTopics(fakeSupabase({})), []);
});
