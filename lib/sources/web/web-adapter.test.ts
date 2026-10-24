// lib/sources/web/web-adapter.test.ts — unit tests, zero network.
// Run: `pnpm test` (node:test + node:assert, no extra dependencies).
// Fixture is labeled SAMPLE DATA (see __fixtures__/serper-response.json) and
// never touches the DB — per docs/06-EVIDENCE-CONTRACT.md fixture rule.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WebAdapter,
  parseResultDate,
  webConfigFromEnv,
} from "./web-adapter.ts";
import type { WebAdapterConfig } from "./web-adapter.ts";
import { SourceNotConfiguredError } from "../types.ts";

const FIXTURE_URL = new URL("./__fixtures__/serper-response.json", import.meta.url);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as {
  _fixture: string;
  organic: Array<Record<string, unknown>>;
};

function stubFetch(body: unknown, status = 200): {
  fetchFn: WebAdapterConfig["fetchFn"];
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn: WebAdapterConfig["fetchFn"] = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchFn, calls };
}

function testConfig(fetchFn: WebAdapterConfig["fetchFn"]): WebAdapterConfig {
  return {
    apiKey: "test-serper-key",
    cacheTtlMs: 60_000,
    minIntervalMs: 0,
    fetchFn,
    nowFn: () => 1789600000000,
  };
}

describe("parseResultDate", () => {
  it("parses absolute dates, passes relative ones through as null", () => {
    // Compare calendar-day parts, not the ISO string: midnight-local parses
    // serialize to the previous UTC day east of Greenwich.
    const parsed = parseResultDate("Aug 12, 2026");
    assert.ok(parsed);
    const day = new Date(parsed);
    assert.equal(day.getFullYear(), 2026);
    assert.equal(day.getMonth(), 7);
    assert.equal(day.getDate(), 12);
    assert.equal(parseResultDate("3 days ago"), null);
    assert.equal(parseResultDate(undefined), null);
  });
});

describe("WebAdapter.collect (labeled fixture)", () => {
  it("posts to Serper and drops linkless results", async () => {
    const { fetchFn, calls } = stubFetch(FIXTURE);
    const adapter = new WebAdapter(testConfig(fetchFn));
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(calls.length, 1);
    assert.ok(calls[0]?.url.includes("google.serper.dev"));
    const sent = JSON.parse(String(calls[0]?.init?.body)) as { q: string; num: number };
    assert.equal(sent.q, "pc troubleshooting");
    // 3 organic, 1 linkless → 2 items; link is the stable external id.
    assert.equal(items.length, 2);
    assert.equal(items[0]?.externalId, "https://example.com/pc-troubleshooting-101");
    assert.equal(items[0]?.source, "web");
  });

  it("dedups repeated links within one response", async () => {
    const dup = {
      organic: [FIXTURE.organic[0], FIXTURE.organic[0], FIXTURE.organic[1]],
    };
    const adapter = new WebAdapter(testConfig(stubFetch(dup).fetchFn));
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(items.length, 2);
  });

  it("serves repeats from cache without new upstream calls", async () => {
    const { fetchFn, calls } = stubFetch(FIXTURE);
    const adapter = new WebAdapter(testConfig(fetchFn));
    await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(calls.length, 1);
  });

  it("throws SourceNotConfiguredError without a key (→ ingest `skipped`)", async () => {
    const adapter = new WebAdapter({ ...testConfig(stubFetch(FIXTURE).fetchFn), apiKey: undefined });
    assert.equal(adapter.isConfigured, false);
    await assert.rejects(
      adapter.collect({ query: "pc troubleshooting", limit: 5 }),
      (err: unknown) => err instanceof SourceNotConfiguredError,
    );
  });

  it("reads SERPER_API_KEY via webConfigFromEnv", () => {
    const withKey = { SERPER_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;
    const empty = {} as unknown as NodeJS.ProcessEnv;
    assert.equal(webConfigFromEnv(withKey).apiKey, "k");
    assert.equal(webConfigFromEnv(empty).apiKey, undefined);
  });
});

describe("WebAdapter.normalize (labeled fixture)", () => {
  it("maps a Serper result to the signals row shape", async () => {
    const adapter = new WebAdapter(testConfig(stubFetch(FIXTURE).fetchFn));
    const [raw] = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.ok(raw);
    const signal = adapter.normalize(raw);
    assert.equal(signal.source, "web");
    assert.equal(signal.source_id, raw.externalId);
    assert.equal(signal.url, "https://example.com/pc-troubleshooting-101");
    assert.equal(signal.title, "PC Troubleshooting 101: Fix It Yourself");
    assert.ok(signal.text?.includes("step-by-step checklist"));
    assert.equal(signal.author, "anonymous");
    // Absolute date → non-null timestamp on the same calendar day (compare in
    // local parts: midnight-local serializes to the previous UTC day east of
    // Greenwich, so no raw startsWith on the ISO string).
    assert.ok(signal.timestamp);
    const day = new Date(signal.timestamp);
    assert.equal(day.getFullYear(), 2026);
    assert.equal(day.getMonth(), 7);
    assert.equal(day.getDate(), 12);
    assert.equal(signal.engagement.position, 1);
    assert.equal(signal.engagement.result_date, "Aug 12, 2026");
  });

  it("keeps relative dates as null timestamp with raw string preserved", async () => {
    const adapter = new WebAdapter(testConfig(stubFetch(FIXTURE).fetchFn));
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    const signal = adapter.normalize(items[1]!);
    assert.equal(signal.timestamp, null);
    assert.equal(signal.engagement.result_date, "3 days ago");
  });
});

describe("WebAdapter.healthCheck", () => {
  it("reports ok:false with the setup hint when unconfigured (never throws)", async () => {
    const adapter = new WebAdapter({ ...testConfig(stubFetch(FIXTURE).fetchFn), apiKey: undefined });
    const status = await adapter.healthCheck();
    assert.equal(status.ok, false);
    assert.ok(status.detail?.includes("SERPER_API_KEY"));
  });

  it("reports ok on a working key", async () => {
    const adapter = new WebAdapter(testConfig(stubFetch(FIXTURE).fetchFn));
    const status = await adapter.healthCheck();
    assert.equal(status.ok, true);
  });
});

// Part 3.7: phrase blocks. Shape copied from a live Serper call on 2026-10-24 (PAA items carried only
// `question`); values are SAMPLE DATA.
const PHRASE_BODY = {
  organic: [{ title: "Budgeting 101", link: "https://example.com/budgeting-101", position: 1 }],
  peopleAlsoAsk: [{ question: "What is the 50/30/20 budget rule?" }, { question: "How to budget $3,000 a month?" }],
  relatedSearches: [{ query: "Budgeting planner" }, { query: "budgeting" }, { query: "Budgeting for students" }, { query: "budgeting planner" }],
};

describe("WebAdapter phrase blocks (Part 3.7)", () => {
  it("keeps PAA + related searches as phrase rows from the same call", async () => {
    const { fetchFn, calls } = stubFetch(PHRASE_BODY);
    const adapter = new WebAdapter(testConfig(fetchFn));
    const items = await adapter.collect({ query: "budgeting", limit: 10, geo: "gb" });
    assert.equal(calls.length, 1, "one Serper credit for organic + phrases");
    const phrases = items.filter((i) => i.externalId.startsWith("serp:"));
    // seed "budgeting" dropped, "Budgeting planner" merged case-insensitively
    assert.deepEqual(
      phrases.map((p) => (p.payload as { phrase: string }).phrase),
      ["what is the 50/30/20 budget rule?", "how to budget $3,000 a month?", "budgeting planner", "budgeting for students"],
    );
    assert.ok(phrases.every((p) => p.externalId.startsWith("serp:gb:")));
    const n = adapter.normalize(phrases[2]!);
    assert.equal(n.engagement.serp_blocks, "related");
    assert.equal(n.engagement.block_count, 1);
    assert.equal(n.engagement.blocks_total, 2);
    assert.equal(n.engagement.best_position, 0);
    assert.ok(n.url?.includes("gl=gb"));
    assert.ok(n.text?.includes("Related searches #1"));
    assert.equal(n.author, "anonymous");
  });

  it("sends gl / hl only when the scan names a region", async () => {
    const { fetchFn, calls } = stubFetch(PHRASE_BODY);
    const adapter = new WebAdapter(testConfig(fetchFn));
    await adapter.collect({ query: "budgeting", limit: 10 });
    await adapter.collect({ query: "budgeting", limit: 10, geo: "au" });
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { q: "budgeting", num: 10 });
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { q: "budgeting", num: 10, gl: "au", hl: "en" });
  });

  it("returns organic rows only when both blocks are missing", async () => {
    const { fetchFn } = stubFetch({ organic: PHRASE_BODY.organic });
    const items = await new WebAdapter(testConfig(fetchFn)).collect({ query: "budgeting", limit: 10, geo: "gb" });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.externalId, "https://example.com/budgeting-101");
  });
});
