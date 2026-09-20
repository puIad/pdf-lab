// lib/sources/gumroad/gumroad-adapter.test.ts — Unit tests for Gumroad marketplace adapter.
// Run: `pnpm test` (node:test + node:assert, zero network).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GumroadAdapter, gumroadConfigFromEnv, type GumroadAdapterConfig } from "./gumroad-adapter.ts";
import { SourceNotConfiguredError } from "../types.ts";

const SAMPLE_GUMROAD_FIXTURE = {
  _fixture: "SAMPLE DATA — Gumroad SERP response (docs/06-EVIDENCE-CONTRACT.md)",
  organic: [
    {
      title: "The Ultimate PC Troubleshooting & Diagnostic Handbook",
      link: "https://techguru.gumroad.com/l/pc-troubleshooting-handbook",
      snippet: "$19.00. Complete PDF guide to diagnosing BIOS, RAM, and GPU issues. Includes printable checklist.",
      position: 1,
    },
    {
      title: "Windows 11 Crash Fix Cheat Sheet - Free Download",
      link: "https://gumroad.com/l/win11-crash-sheet",
      snippet: "Free. Rapid cheat sheet for BSOD codes and system recovery.",
      position: 2,
    },
  ],
};

function stubFetch(body: unknown, status = 200): GumroadAdapterConfig["fetchFn"] {
  return async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("GumroadAdapter", () => {
  it("has correct metadata matching SourceAdapter interface", () => {
    const adapter = new GumroadAdapter({ apiKey: "test-key" });
    assert.equal(adapter.key, "gumroad");
    assert.equal(adapter.displayName, "Gumroad");
    assert.equal(adapter.tiers, 2);
  });

  it("throws SourceNotConfiguredError when SERPER_API_KEY is missing", async () => {
    const adapter = new GumroadAdapter({ apiKey: "" });
    assert.equal(adapter.isConfigured, false);
    await assert.rejects(
      adapter.collect({ query: "pc handbook", limit: 5 }),
      (err) => err instanceof SourceNotConfiguredError,
    );
  });

  it("reads config from environment", () => {
    const withKey = { SERPER_API_KEY: "gum_key" } as unknown as NodeJS.ProcessEnv;
    const empty = {} as unknown as NodeJS.ProcessEnv;
    assert.equal(gumroadConfigFromEnv(withKey).apiKey, "gum_key");
    assert.equal(gumroadConfigFromEnv(empty).apiKey, undefined);
  });

  it("collects items and sends targeted site:gumroad.com query", async () => {
    let capturedQuery = "";
    const fetchFn: GumroadAdapterConfig["fetchFn"] = async (_, init) => {
      const body = JSON.parse(String(init?.body)) as { q: string };
      capturedQuery = body.q;
      return new Response(JSON.stringify(SAMPLE_GUMROAD_FIXTURE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const adapter = new GumroadAdapter({
      apiKey: "test-key",
      fetchFn,
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc diagnostic", limit: 10 });
    assert.ok(capturedQuery.includes("site:gumroad.com"));
    assert.equal(items.length, 2);
    assert.equal(items[0].source, "gumroad");
  });

  it("normalizes Gumroad listing with price and format", async () => {
    const adapter = new GumroadAdapter({
      apiKey: "test-key",
      fetchFn: stubFetch(SAMPLE_GUMROAD_FIXTURE),
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc diagnostic", limit: 10 });
    const normalized = adapter.normalize(items[0]);

    assert.equal(normalized.source, "gumroad");
    assert.equal(normalized.url, "https://techguru.gumroad.com/l/pc-troubleshooting-handbook");
    assert.equal(normalized.engagement.price, "$19");
    assert.equal(normalized.engagement.format, "checklist");
  });

  it("extracts CompetitorProduct objects including Free products", async () => {
    const adapter = new GumroadAdapter({
      apiKey: "test-key",
      fetchFn: stubFetch(SAMPLE_GUMROAD_FIXTURE),
      minIntervalMs: 0,
    });

    const items = await adapter.collect({ query: "pc diagnostic", limit: 10 });
    const competitors = adapter.extractCompetitors(items);

    assert.equal(competitors.length, 2);
    assert.equal(competitors[0].price, "$19");
    assert.equal(competitors[0].priceNumeric, 19);
    assert.equal(competitors[1].price, "Free");
    assert.equal(competitors[1].priceNumeric, 0);
  });

  it("healthCheck reports status honestly without throwing", async () => {
    const unconfigured = new GumroadAdapter({ apiKey: "" });
    const status1 = await unconfigured.healthCheck();
    assert.equal(status1.ok, false);

    const configured = new GumroadAdapter({ apiKey: "key" });
    const status2 = await configured.healthCheck();
    assert.equal(status2.ok, true);
  });
});
