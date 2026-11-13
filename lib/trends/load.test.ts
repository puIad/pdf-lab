import test from "node:test";
import assert from "node:assert/strict";
import { getTrendingRadarService, loadStoredMarketTopics } from "./load.ts";
import { TrendingRadarService, thinRadarMessage } from "./service.ts";

const DAY = 86_400_000;
const iso = (d: number) => new Date(Date.now() - d * DAY).toISOString();

function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from: (t: string) => {
      const q = { select: () => q, in: () => q, eq: () => q, limit: () => q, order: () => q, range: () => q, then: (r: (v: unknown) => void) => r({ data: tables[t] ?? [], error: null }) };
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

test("radar topics are stored market ids, and a market with one dated signal has trend unknown", async () => {
  const many = ["a", "b", "c", "d", "e"].map((id) => ({ market_id: "m2", ...sig(id) }));
  const radar = await getTrendingRadarService(
    fakeSupabase({
      markets: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }, { id: "m3", name: "C" }],
      market_signals: [{ market_id: "m1", ...sig("only") }, ...many],
    }),
  );
  const topics = radar.getAnalyzedTopics();
  assert.deepEqual(topics.map((t) => t.marketId).sort(), ["m1", "m2"]);
  assert.equal(topics.find((t) => t.marketId === "m1")?.classification, "unknown");
  assert.notEqual(topics.find((t) => t.marketId === "m2")?.classification, "unknown");
});

test("thin data: no trend to plot, and the empty state states the stored counts", async () => {
  const topics = await loadStoredMarketTopics(
    fakeSupabase({
      markets: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }],
      market_signals: [{ market_id: "m1", ...sig("x") }, { market_id: "m2", ...sig("y") }, { market_id: "m2", ...sig("z") }],
    }),
  );
  assert.equal(new TrendingRadarService(topics).hasTrend(), false);
  assert.match(thinRadarMessage(topics), /^3 dated signals are stored across 2 markets\. A market needs 5 dated signals .*, or 3 when /);
  assert.equal(new TrendingRadarService([]).hasTrend(), false);
  assert.match(thinRadarMessage([]), /^0 dated signals are stored across 0 markets/);
});

test("the empty-state rule matches the detector: 4 recent single-source signals are not enough", async () => {
  const load = (rows: unknown[]) => loadStoredMarketTopics(fakeSupabase({ markets: [{ id: "m1", name: "A" }], market_signals: rows }));
  const recent = (n: number) => Array.from({ length: n }, (_, i) => ({ market_id: "m1", ...sig("r" + i) }));

  const four = await load(recent(4));
  assert.equal(new TrendingRadarService(four).hasTrend(), false);
  assert.match(thinRadarMessage(four), /^4 dated signals are stored across 1 market\. A market needs 5 dated signals/);

  assert.equal(new TrendingRadarService(await load(recent(5))).hasTrend(), true);
  // 3 are enough when the oldest is two weeks old, or when YouTube and Reddit both appear.
  assert.equal(new TrendingRadarService(await load([...recent(2), { market_id: "m1", ...sig("old", { published_at: iso(20) }) }])).hasTrend(), true);
  assert.equal(new TrendingRadarService(await load([...recent(2), { market_id: "m1", ...sig("yt", { sources: { type: "youtube" } }) }])).hasTrend(), true);
});
