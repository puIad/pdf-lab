// lib/sources/gtrends/gtrends-adapter.test.ts — unit tests, zero network.
// Run: `pnpm test` (node:test + node:assert, no extra dependencies).
// Fixture is labeled SAMPLE DATA (see __fixtures__/trends-responses.json) and
// never touches the DB — per docs/06-EVIDENCE-CONTRACT.md fixture rule.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GTrendsAdapter } from "./gtrends-adapter.ts";
import type {
  GTrendsAdapterConfig,
  TrendsBackend,
} from "./gtrends-adapter.ts";

const FIXTURE_URL = new URL(
  "./__fixtures__/trends-responses.json",
  import.meta.url,
);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as {
  _fixture: string;
  interestOverTime: unknown;
  relatedQueries: unknown;
  autoComplete: unknown;
};

function stubBackend(calls: string[]): TrendsBackend {
  return {
    interestOverTime: async () => {
      calls.push("interestOverTime");
      return JSON.stringify(FIXTURE.interestOverTime);
    },
    relatedQueries: async () => {
      calls.push("relatedQueries");
      return JSON.stringify(FIXTURE.relatedQueries);
    },
    autoComplete: async () => {
      calls.push("autoComplete");
      return JSON.stringify(FIXTURE.autoComplete);
    },
  };
}

function testConfig(overrides?: Partial<GTrendsAdapterConfig>): GTrendsAdapterConfig {
  const calls: string[] = [];
  return {
    geo: "",
    windowDays: 90,
    minIntervalMs: 0,
    cacheTtlMs: 24 * 60 * 60 * 1000,
    backend: stubBackend(calls),
    nowFn: () => 1789600000000,
    ...overrides,
  };
}

describe("GTrendsAdapter.collect (labeled fixture)", () => {
  it("returns 1 interest summary + related queries within the limit", async () => {
    const adapter = new GTrendsAdapter(testConfig());
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(items.length, 3);
    assert.equal(items[0]?.externalId.startsWith("gtrends:iot:"), true);
    assert.equal(items[1]?.externalId.startsWith("gtrends:rq:"), true);
    assert.equal(items[2]?.externalId.startsWith("gtrends:rq:"), true);
    // Related-query external ids are distinct and stable.
    assert.notEqual(items[1]?.externalId, items[2]?.externalId);
    assert.ok(items.every((i) => i.source === "gtrends"));
  });

  it("caps items at the requested limit", async () => {
    const adapter = new GTrendsAdapter(testConfig());
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 2 });
    assert.equal(items.length, 2);
  });

  it("serves repeats from the 24h cache without new upstream calls", async () => {
    const calls: string[] = [];
    const adapter = new GTrendsAdapter({
      ...testConfig(),
      backend: stubBackend(calls),
    });
    await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(calls.length, 2);
    await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    assert.equal(calls.length, 2);
  });

  it("rejects an empty query", async () => {
    const adapter = new GTrendsAdapter(testConfig());
    await assert.rejects(
      adapter.collect({ query: "   ", limit: 10 }),
      /non-empty query/,
    );
  });

  it("surfaces upstream breakage as an error (never fake data)", async () => {
    const broken: TrendsBackend = {
      interestOverTime: async () => {
        throw new Error("HTTP 429");
      },
      relatedQueries: async () => JSON.stringify(FIXTURE.relatedQueries),
      autoComplete: async () => JSON.stringify(FIXTURE.autoComplete),
    };
    const adapter = new GTrendsAdapter({ ...testConfig(), backend: broken });
    await assert.rejects(
      adapter.collect({ query: "pc troubleshooting", limit: 10 }),
      /interestOverTime failed/,
    );
  });
});

describe("GTrendsAdapter.normalize (labeled fixture)", () => {
  it("maps the interest summary to the signals row shape", async () => {
    const adapter = new GTrendsAdapter(testConfig());
    const [raw] = await adapter.collect({ query: "pc troubleshooting", limit: 1 });
    assert.ok(raw);
    const signal = adapter.normalize(raw);
    assert.equal(signal.source, "gtrends");
    assert.equal(signal.source_id, raw.externalId);
    assert.equal(signal.author, "anonymous");
    assert.ok(signal.url?.includes("trends.google.com"));
    assert.ok(signal.title?.includes("pc troubleshooting"));
    assert.equal(signal.engagement.avg_interest, 77); // (64+70+82+91)/4 rounded
    assert.equal(signal.engagement.max_interest, 91);
    assert.equal(signal.engagement.direction, "rising");
    assert.deepEqual(signal.market_candidates, []);
    assert.equal(signal.intent, null);
  });

  it("maps a related query with rising flag and value", async () => {
    const adapter = new GTrendsAdapter(testConfig());
    const items = await adapter.collect({ query: "pc troubleshooting", limit: 10 });
    const rising = items[2];
    assert.ok(rising);
    const signal = adapter.normalize(rising);
    assert.ok(signal.title?.includes("pc troubleshooting flowchart"));
    assert.equal(signal.engagement.interest_value, 45);
    assert.equal(signal.engagement.rising, true);
    assert.equal(signal.author, "anonymous");
  });
});

describe("GTrendsAdapter.healthCheck", () => {
  it("reports ok on a working backend", async () => {
    const adapter = new GTrendsAdapter(testConfig());
    const status = await adapter.healthCheck();
    assert.equal(status.ok, true);
    assert.ok(status.detail?.includes("unofficial-api ok"));
  });

  it("reports ok:false (never throws) on a broken backend", async () => {
    const broken: TrendsBackend = {
      interestOverTime: async () => {
        throw new Error("boom");
      },
      relatedQueries: async () => {
        throw new Error("boom");
      },
      autoComplete: async () => {
        throw new Error("boom");
      },
    };
    const adapter = new GTrendsAdapter({ ...testConfig(), backend: broken });
    const status = await adapter.healthCheck();
    assert.equal(status.ok, false);
    assert.ok(status.detail?.length);
  });
});
