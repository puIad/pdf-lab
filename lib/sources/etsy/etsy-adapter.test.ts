// lib/sources/etsy/etsy-adapter.test.ts — Unit tests for Etsy marketplace adapter.
// Run: `pnpm test` (node:test + node:assert, zero network).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EtsyAdapter, etsyConfigFromEnv, type EtsyAdapterConfig } from "./etsy-adapter.ts";
import { SourceNotConfiguredError } from "../types.ts";

const SAMPLE_ETSY_FIXTURE = {
  _fixture: "SAMPLE DATA — Etsy SERP response (docs/06-EVIDENCE-CONTRACT.md)",
  organic: [
    {
      title: "PC Troubleshooting Flowchart & Diagnostic Guide Printable - Etsy",
      link: "https://www.etsy.com/listing/123456789/pc-troubleshooting-flowchart",
      snippet: "Rating: 4.9 · 28 reviews · $4.99 · In stock. Printable PC troubleshooting flowchart and hardware diagnostic checklist. Instant digital download PDF.",
      position: 1,
    },
    {
      title: "Computer Repair Checklist Template PDF by TechShop on Etsy",
      link: "https://www.etsy.com/listing/987654321/computer-repair-checklist",
      snippet: "$9.50. Step-by-step workbook for home IT triage. Includes boot error diagnostic tree.",
      position: 2,
    },
    {
      title: "Broken link with no url",
      snippet: "Missing link should be ignored",
    },
  ],
};

function stubFetch(body: unknown, status = 200): EtsyAdapterConfig["fetchFn"] {
  return async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("EtsyAdapter", () => {
  it("has correct metadata matching SourceAdapter interface", () => {
    const adapter = new EtsyAdapter({ apiKey: "test-key" });
    assert.equal(adapter.key, "etsy");
    assert.equal(adapter.displayName, "Etsy");
    assert.equal(adapter.tiers, 2);
  });

  it("throws SourceNotConfiguredError when SERPER_API_KEY is missing", async () => {
    const adapter = new EtsyAdapter({ apiKey: "" });
    assert.equal(adapter.isConfigured, false);
    await assert.rejects(
      adapter.collect({ query: "pc troubleshooting", limit: 5 }),
      (err) => err instanceof SourceNotConfiguredError,
    );
  });

  it("reads config from environment", () => {
    const withKey = { SERPER_API_KEY: "k123" } as unknown as NodeJS.ProcessEnv;
    const empty = {} as unknown as NodeJS.ProcessEnv;
    assert.equal(etsyConfigFromEnv(withKey).apiKey, "k123");
    assert.equal(etsyConfigFromEnv(empty).apiKey, undefined);
  });

  it("collects items and sends targeted site:etsy.com query", async () => {
    let capturedQuery = "";
    const fetchFn: EtsyAdapterConfig["fetchFn"] = async (_, init) => {
      const body = JSON.parse(String(init?.body)) as { q: string };
      capturedQuery = body.q;
      return new Response(JSON.stringify(SAMPLE_ETSY_FIXTURE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const adapter = new EtsyAdapter({
      apiKey: "test-key",
      fetchFn,
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc repair", limit: 10 });
    assert.ok(capturedQuery.includes("site:etsy.com"));
    assert.ok(capturedQuery.includes("pc repair"));
    assert.equal(items.length, 2); // 3 items, 1 without link dropped
    assert.equal(items[0].source, "etsy");
    assert.equal(items[0].externalId, "https://www.etsy.com/listing/123456789/pc-troubleshooting-flowchart");
  });

  it("normalizes raw signal into MarketSignal with parsed marketplace metadata", async () => {
    const adapter = new EtsyAdapter({
      apiKey: "test-key",
      fetchFn: stubFetch(SAMPLE_ETSY_FIXTURE),
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc repair", limit: 10 });
    const normalized = adapter.normalize(items[0]);

    assert.equal(normalized.source, "etsy");
    assert.equal(normalized.url, "https://www.etsy.com/listing/123456789/pc-troubleshooting-flowchart");
    assert.ok(normalized.title?.includes("PC Troubleshooting Flowchart"));
    assert.equal(normalized.engagement.price, "$4.99");
    assert.equal(normalized.engagement.rating, 4.9);
    assert.equal(normalized.engagement.review_count, 28);
    assert.equal(normalized.engagement.format, "checklist");
  });

  it("extracts CompetitorProduct objects", async () => {
    const adapter = new EtsyAdapter({
      apiKey: "test-key",
      fetchFn: stubFetch(SAMPLE_ETSY_FIXTURE),
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc repair", limit: 10 });
    const competitors = adapter.extractCompetitors(items);

    assert.equal(competitors.length, 2);
    assert.equal(competitors[0].platform, "etsy");
    assert.equal(competitors[0].price, "$4.99");
    assert.equal(competitors[0].priceNumeric, 4.99);
    assert.equal(competitors[0].rating, 4.9);
    assert.equal(competitors[0].reviewCount, 28);
  });

  it("healthCheck reports status honestly without throwing", async () => {
    const unconfigured = new EtsyAdapter({ apiKey: "" });
    const status1 = await unconfigured.healthCheck();
    assert.equal(status1.ok, false);

    const configured = new EtsyAdapter({ apiKey: "key" });
    const status2 = await configured.healthCheck();
    assert.equal(status2.ok, true);
  });
});

describe("EtsyAdapter Serper star fields and goto links (Part 3.9)", () => {
  it("keeps rating/ratingCount over the snippet and does not collapse Google goto links", async () => {
    const adapter = new EtsyAdapter({
      apiKey: "k",
      minIntervalMs: 0,
      fetchFn: stubFetch({
        organic: [
          { title: "Budget Sheet - Etsy", link: "https://www.etsy.com/listing/1/budget?ref=x", snippet: "Digital Download · $3.50", rating: 4.7, ratingCount: 22, position: 1 },
          { title: "A", link: "https://www.google.com/goto?url=AAA", snippet: "x", position: 2 },
          { title: "B", link: "https://www.google.com/goto?url=BBB", snippet: "y", position: 3 },
        ],
      }),
    });
    const items = await adapter.collect({ query: "budget", limit: 10 });
    assert.deepEqual(items.map((i) => i.externalId), [
      "https://www.etsy.com/listing/1/budget",
      "https://www.google.com/goto?url=AAA",
      "https://www.google.com/goto?url=BBB",
    ]);
    const s = adapter.normalize(items[0]);
    assert.equal(s.engagement.review_count, 22);
    assert.equal(s.engagement.rating, 4.7);
    assert.equal(s.engagement.price, "$3.50");
    assert.equal(adapter.extractCompetitors(items)[0].reviewCount, 22);
  });
});

describe("marketplace price parsing (Part 3.9)", () => {
  it("does not read 'Free Cash Flow' or 'Debt Free' as a price", async () => {
    const { parsePrice } = await import("../marketplace-helper.ts");
    assert.equal(parsePrice("the Free Cash Flow approach to capital budgeting").priceStr, null);
    assert.equal(parsePrice("How to Be Debt Free: a simple plan").priceStr, null);
    assert.equal(parsePrice("Free printable budget sheet").priceStr, "Free");
    assert.equal(parsePrice("Budget planner $4.50, free shipping").priceStr, "$4.50");
  });
});
