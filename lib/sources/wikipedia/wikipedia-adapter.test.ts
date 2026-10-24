// lib/sources/wikipedia/wikipedia-adapter.test.ts — unit tests, zero network.
// All API bodies below are SAMPLE DATA (fixture rule, 06-EVIDENCE-CONTRACT); nothing touches the DB.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WikipediaAdapter, titleMatches, PRIOR_DAYS, RECENT_DAYS } from "./wikipedia-adapter.ts";
import type { PageviewsPayload, WikipediaAdapterConfig } from "./wikipedia-adapter.ts";

const NOW = Date.parse("2026-10-24T12:00:00Z");

/** 84 sample days: 100 views/day for the prior 56, 150/day for the recent 28. */
function samplePageviews() {
  const items = [];
  for (let i = 0; i < PRIOR_DAYS + RECENT_DAYS; i++) {
    const d = new Date(Date.parse("2026-08-01T00:00:00Z") + i * 86400_000);
    const stamp = d.toISOString().slice(0, 10).replace(/-/g, "") + "00";
    items.push({ timestamp: stamp, views: i < PRIOR_DAYS ? 100 : 150 });
  }
  return { items };
}

function stub(routes: Array<[RegExp, number, unknown]>, calls: string[]): WikipediaAdapterConfig {
  return {
    userAgent: "PDF-Lab-test",
    cacheTtlMs: 60_000,
    nowFn: () => NOW,
    fetchFn: async (input) => {
      const url = String(input);
      calls.push(url);
      const hit = routes.find(([re]) => re.test(url));
      if (!hit) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(hit[2]), { status: hit[1] });
    },
  };
}

describe("titleMatches", () => {
  it("accepts stems and rejects partial matches", () => {
    assert.equal(titleMatches("budgeting", "Budget"), true);
    assert.equal(titleMatches("intermittent fasting", "Intermittent fasting"), true);
    assert.equal(titleMatches("toddler sleep", "Toddler"), false);
    assert.equal(titleMatches("pc troubleshooting", "Asus Eee PC"), false);
  });
});

describe("WikipediaAdapter", () => {
  it("resolves an exact title and compares the 28-day window with the prior 56 days", async () => {
    const calls: string[] = [];
    const adapter = new WikipediaAdapter(
      stub(
        [
          [/titles=intermittent/, 200, { query: { pages: [{ title: "Intermittent fasting" }] } }],
          [/pageviews\/per-article/, 200, samplePageviews()],
        ],
        calls,
      ),
    );
    const raw = await adapter.collect({ query: "intermittent fasting", limit: 5 });
    assert.equal(raw.length, 1);
    const p = raw[0].payload as PageviewsPayload;
    assert.equal(p.recentViews, 150 * RECENT_DAYS);
    assert.equal(p.priorViews, 100 * PRIOR_DAYS);
    assert.match(calls[1], /Intermittent_fasting\/daily\/\d{8}\/20261023$/);

    const s = adapter.normalize(raw[0]);
    assert.equal(s.engagement.change_pct, 50);
    assert.equal(s.engagement.direction, "rising");
    assert.equal(s.author, "anonymous");
    assert.equal(s.url, "https://en.wikipedia.org/wiki/Intermittent_fasting");

    await adapter.collect({ query: "intermittent fasting", limit: 5 });
    assert.equal(calls.length, 2, "second collect is served from cache");
  });

  it("skips disambiguation pages and returns nothing when no search hit matches", async () => {
    const calls: string[] = [];
    const adapter = new WikipediaAdapter(
      stub(
        [
          [/titles=keto/, 200, { query: { pages: [{ title: "Keto diet", pageprops: { disambiguation: "" } }] } }],
          [/generator=search/, 200, { query: { pages: [{ title: "Low-carbohydrate diet", index: 1 }] } }],
        ],
        calls,
      ),
    );
    assert.deepEqual(await adapter.collect({ query: "keto diet", limit: 5 }), []);
    assert.equal(calls.some((c) => c.includes("pageviews")), false);
  });

  it("throws on upstream errors so ingest reports the source as failed", async () => {
    const adapter = new WikipediaAdapter(stub([[/api\.php/, 503, {}]], []));
    await assert.rejects(adapter.collect({ query: "budgeting", limit: 5 }), /HTTP 503/);
  });
});
