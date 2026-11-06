// lib/competition/check.test.ts — Part 3.9 competition check. Zero network, zero DB.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_SOURCES,
  batchByLength,
  checkEntityId,
  loadCompetitionChecks,
  parsePriceText,
  runCompetitionCheck,
  summarizeListings,
  type CheckDeps,
  type EvidenceDraft,
} from "./check.ts";
import { scanSourceKeys } from "../ideas/seeds.ts";
import type { MarketSignal, RawSignal, SourceAdapter } from "../sources/types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

function listing(source: string, url: string | null): MarketSignal {
  return {
    source,
    source_id: url ?? "none",
    url,
    title: "t",
    text: `snippet ${url}`,
    author: null,
    timestamp: null,
    engagement: {},
    market_candidates: [],
    intent: "strong",
    pain_points: [],
  };
}

function adapter(key: string, urls: string[], calls: string[], fail = false): SourceAdapter {
  return {
    key,
    displayName: key,
    tiers: 2,
    async collect(input) {
      calls.push(`${key}:${input.query}`);
      if (fail) throw new Error("boom");
      return urls.map((u) => ({ source: key, externalId: u, fetchedAt: "", payload: u }) as RawSignal);
    },
    normalize: (raw) => listing(key, raw.payload as string),
    healthCheck: async () => ({ ok: true }),
  } as SourceAdapter;
}

function deps(adapters: SourceAdapter[], saved: EvidenceDraft[][]): CheckDeps {
  return {
    adapters,
    resolveSourceId: async (k) => `src-${k}`,
    upsertSignals: async (rows) => rows.length,
    replaceEvidence: async (_id, rows) => void saved.push(rows),
  };
}

describe("competition check", () => {
  it("scans never call a marketplace adapter (no Serper call without a click)", () => {
    for (const ps of ["web", "autocomplete"] as const) {
      for (const k of CHECK_SOURCES) assert.ok(!scanSourceKeys(ps).includes(k), `${k} in scan sources`);
    }
  });

  it("entity id is stable, uuid-shaped and ignores case and spacing", () => {
    const a = checkEntityId("Budget Planner  for Beginners");
    assert.equal(a, checkEntityId(" budget planner for beginners "));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.notEqual(a, checkEntityId("budget planner"));
  });

  it("batches long url lists so the query string stays short", () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://www.google.com/goto?url=${"x".repeat(380)}${i}`);
    const batches = batchByLength(urls, 4000);
    assert.ok(batches.length > 1);
    assert.deepEqual(batches.flat(), urls);
    assert.ok(batches.every((b) => b.reduce((a, u) => a + encodeURIComponent(u).length + 3, 0) <= 4000));
    assert.deepEqual(batchByLength([], 10), []);
  });

  it("parses prices", () => {
    assert.deepEqual(parsePriceText("$4.99"), { value: 4.99, currency: "$" });
    assert.deepEqual(parsePriceText("Free"), { value: 0, currency: null });
    assert.equal(parsePriceText(null), null);
    assert.equal(parsePriceText("n/a"), null);
  });

  it("summarizes raw counts per marketplace, keeping zero-listing marketplaces", () => {
    const out = summarizeListings(
      ["etsy", "gumroad"],
      [
        { platform: "etsy", url: "a", price: "$4.99", reviews: 28 },
        { platform: "etsy", url: "b", price: "$12", reviews: null },
        { platform: "etsy", url: "c", price: null, reviews: 3 },
      ],
    );
    assert.deepEqual(out[0], { platform: "etsy", label: "Etsy", listings: 3, withReviews: 2, reviews: 31, priceMin: 4.99, priceMax: 12, currency: "$" });
    assert.deepEqual(out[1], { platform: "gumroad", label: "Gumroad", listings: 0, withReviews: 0, reviews: 0, priceMin: null, priceMax: null, currency: null });
  });

  it("mixed currencies drop the symbol", () => {
    const [m] = summarizeListings(["etsy"], [
      { platform: "etsy", url: "a", price: "$5", reviews: null },
      { platform: "etsy", url: "b", price: "£7", reviews: null },
    ]);
    assert.equal(m.currency, null);
  });

  it("runs only the three marketplaces and stores one row per listing plus zero markers", async () => {
    const calls: string[] = [];
    const saved: EvidenceDraft[][] = [];
    const others = adapter("web", ["x"], calls);
    const res = await runCompetitionCheck("Budget Planner", deps([adapter("etsy", ["e1", "e2"], calls), adapter("gumroad", [], calls), adapter("kdp", ["k1"], calls, true), others], saved));
    assert.deepEqual(calls.sort(), ["etsy:budget planner", "gumroad:budget planner", "kdp:budget planner"]);
    assert.equal(saved.length, 1);
    const rows = saved[0];
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.entity_type === "competition" && r.entity_id === res.entityId));
    assert.deepEqual(rows.filter((r) => r.url).map((r) => [r.source_id, r.url]), [["src-etsy", "e1"], ["src-etsy", "e2"]]);
    assert.equal(rows.find((r) => !r.url)?.claim, '0 gumroad listings observed for "budget planner"'.replace("gumroad", "Gumroad"));
    assert.equal(res.sources.find((s) => s.key === "kdp")?.status, "failed");
  });

  it("stores nothing when every marketplace fails, so the previous check stays", async () => {
    const saved: EvidenceDraft[][] = [];
    await runCompetitionCheck("x y", deps(CHECK_SOURCES.map((k) => adapter(k, [], [], true)), saved));
    assert.equal(saved.length, 0);
  });

  it("loads stored checks and reconciles numbers with the stored rows", async () => {
    const id = checkEntityId("budget planner");
    const tables: Record<string, unknown[]> = {
      evidence: [
        { entity_id: id, url: "e1", created_at: "2026-11-06T10:00:00Z", sources: { type: "etsy" } },
        { entity_id: id, url: "e2", created_at: "2026-11-06T10:00:01Z", sources: { type: "etsy" } },
        { entity_id: id, url: null, created_at: "2026-11-06T10:00:01Z", sources: { type: "gumroad" } },
      ],
      signals: [
        { external_id: "e1", engagement: { price: "$3", review_count: 10 }, sources: { type: "etsy" } },
        { external_id: "e2", engagement: { price: "$9.50", review_count: null }, sources: { type: "etsy" } },
      ],
    };
    const fake = {
      from(t: string) {
        const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: tables[t], error: null }) };
        return q;
      },
    } as unknown as SupabaseClient;
    const out = await loadCompetitionChecks(fake, ["Budget planner", "other phrase"]);
    assert.deepEqual(Object.keys(out), ["budget planner"]);
    const c = out["budget planner"];
    assert.equal(c.listings, 2);
    assert.equal(c.checkedAt, "2026-11-06T10:00:01Z");
    assert.deepEqual(
      c.marketplaces.map((m) => [m.platform, m.listings, m.reviews, m.priceMin, m.priceMax]),
      [["etsy", 2, 10, 3, 9.5], ["gumroad", 0, 0, null, null]],
    );
  });
});
