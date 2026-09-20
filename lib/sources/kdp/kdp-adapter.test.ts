// lib/sources/kdp/kdp-adapter.test.ts — Unit tests for Amazon KDP adapter.
// Run: `pnpm test` (node:test + node:assert, zero network).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KdpAdapter, kdpConfigFromEnv, type KdpAdapterConfig } from "./kdp-adapter.ts";
import { SourceNotConfiguredError } from "../types.ts";

const SAMPLE_KDP_FIXTURE = {
  _fixture: "SAMPLE DATA — Amazon KDP SERP response (docs/06-EVIDENCE-CONTRACT.md)",
  organic: [
    {
      title: "PC Repair & Troubleshooting Manual: 2026 Edition: Amazon.com: Books",
      link: "https://www.amazon.com/PC-Repair-Troubleshooting-Manual-Edition/dp/B012345678",
      snippet: "Rating: 4.6 · 142 reviews · $14.99 · In Stock. Comprehensive guide to diagnosing hardware boot faults and software conflicts. Kindle & Paperback available.",
      position: 1,
    },
  ],
};

function stubFetch(body: unknown, status = 200): KdpAdapterConfig["fetchFn"] {
  return async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("KdpAdapter", () => {
  it("has correct metadata matching SourceAdapter interface", () => {
    const adapter = new KdpAdapter({ apiKey: "test-key" });
    assert.equal(adapter.key, "kdp");
    assert.equal(adapter.displayName, "Amazon KDP");
    assert.equal(adapter.tiers, 2);
  });

  it("throws SourceNotConfiguredError when SERPER_API_KEY is missing", async () => {
    const adapter = new KdpAdapter({ apiKey: "" });
    assert.equal(adapter.isConfigured, false);
    await assert.rejects(
      adapter.collect({ query: "pc manual", limit: 5 }),
      (err) => err instanceof SourceNotConfiguredError,
    );
  });

  it("reads config from environment", () => {
    const withKey = { SERPER_API_KEY: "kdp_key" } as unknown as NodeJS.ProcessEnv;
    const empty = {} as unknown as NodeJS.ProcessEnv;
    assert.equal(kdpConfigFromEnv(withKey).apiKey, "kdp_key");
    assert.equal(kdpConfigFromEnv(empty).apiKey, undefined);
  });

  it("collects items and sends targeted site:amazon.com query", async () => {
    let capturedQuery = "";
    const fetchFn: KdpAdapterConfig["fetchFn"] = async (_, init) => {
      const body = JSON.parse(String(init?.body)) as { q: string };
      capturedQuery = body.q;
      return new Response(JSON.stringify(SAMPLE_KDP_FIXTURE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const adapter = new KdpAdapter({
      apiKey: "test-key",
      fetchFn,
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.ok(capturedQuery.includes("site:amazon.com"));
    assert.equal(items.length, 1);
    assert.equal(items[0].source, "kdp");
  });

  it("normalizes Amazon KDP listing with platform, rating, and price", async () => {
    const adapter = new KdpAdapter({
      apiKey: "test-key",
      fetchFn: stubFetch(SAMPLE_KDP_FIXTURE),
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    const normalized = adapter.normalize(items[0]);

    assert.equal(normalized.source, "kdp");
    assert.ok(normalized.title?.includes("PC Repair & Troubleshooting Manual"));
    assert.equal(normalized.engagement.price, "$14.99");
    assert.equal(normalized.engagement.rating, 4.6);
    assert.equal(normalized.engagement.review_count, 142);
  });

  it("extracts CompetitorProduct objects with platform amazon_kdp", async () => {
    const adapter = new KdpAdapter({
      apiKey: "test-key",
      fetchFn: stubFetch(SAMPLE_KDP_FIXTURE),
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    const competitors = adapter.extractCompetitors(items);

    assert.equal(competitors.length, 1);
    assert.equal(competitors[0].platform, "amazon_kdp");
    assert.equal(competitors[0].price, "$14.99");
    assert.equal(competitors[0].priceNumeric, 14.99);
    assert.equal(competitors[0].rating, 4.6);
    assert.equal(competitors[0].reviewCount, 142);
  });

  it("healthCheck reports status honestly without throwing", async () => {
    const unconfigured = new KdpAdapter({ apiKey: "" });
    const status1 = await unconfigured.healthCheck();
    assert.equal(status1.ok, false);

    const configured = new KdpAdapter({ apiKey: "key" });
    const status2 = await configured.healthCheck();
    assert.equal(status2.ok, true);
  });
});
