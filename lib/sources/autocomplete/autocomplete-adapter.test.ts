// lib/sources/autocomplete/autocomplete-adapter.test.ts — unit tests, zero network.
// Response bodies are SAMPLE DATA shaped like live replies seen 2026-10-24 (fixture rule).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AutocompleteAdapter,
  autocompleteConfigFromEnv,
  expansionPlan,
  parseSuggestions,
} from "./autocomplete-adapter.ts";
import type { AutocompleteAdapterConfig, SuggestionPayload } from "./autocomplete-adapter.ts";
import { SourceNotConfiguredError } from "../types.ts";

const BODIES = {
  google: ["keto diet", ["keto diet", "keto diet plan", "keto diet food list"]],
  youtube: ["keto diet", ["keto diet recipes", "keto diet plan"]],
  bing: ["keto diet", ["keto diet food list", "keto diet plan", "weight watchers"]],
  ddg: [{ phrase: "keto diet plan" }, { phrase: "keto diet meaning" }],
  amazon: { suggestions: [{ value: "keto diet book" }, { value: "keto diet plan" }] },
};

function config(overrides: Partial<AutocompleteAdapterConfig> = {}, failing: string[] = []): AutocompleteAdapterConfig {
  return {
    enabled: true,
    disabledReason: "disabled in test",
    geo: "us",
    cacheTtlMs: 60_000,
    minIntervalMs: 0,
    nowFn: () => Date.parse("2026-10-24T12:00:00Z"),
    fetchFn: async (input) => {
      const url = String(input);
      const engine = url.includes("ds=yt")
        ? "youtube"
        : url.includes("suggestqueries")
          ? "google"
          : url.includes("bing")
            ? "bing"
            : url.includes("duckduckgo")
              ? "ddg"
              : "amazon";
      if (failing.includes(engine)) return new Response("blocked", { status: 503 });
      if (engine === "google" && url.includes("q=how%20to%20keto%20diet")) {
        return new Response(JSON.stringify(["how to keto diet", ["how to keto diet", "how to keto diet for beginners"]]));
      }
      // Only the bare seed returns suggestions; expansion probes return empty lists.
      const isSeed = /[?&](q|query|prefix)=keto%20diet(&|$)/.test(url);
      const empty = engine === "ddg" ? [] : engine === "amazon" ? { suggestions: [] } : ["x", []];
      return new Response(JSON.stringify(isSeed ? BODIES[engine] : empty), { status: 200 });
    },
    ...overrides,
  };
}

describe("autocomplete config guard (DEC-008 local-only)", () => {
  it("is enabled only with the flag, outside production and outside Vercel", () => {
    assert.equal(autocompleteConfigFromEnv({ PDFLAB_UNOFFICIAL_AUTOCOMPLETE: "1", NODE_ENV: "development" }).enabled, true);
    assert.equal(autocompleteConfigFromEnv({ NODE_ENV: "development" }).enabled, false);
    assert.equal(autocompleteConfigFromEnv({ PDFLAB_UNOFFICIAL_AUTOCOMPLETE: "1", NODE_ENV: "production" }).enabled, false);
    assert.equal(autocompleteConfigFromEnv({ PDFLAB_UNOFFICIAL_AUTOCOMPLETE: "1", NODE_ENV: "development", VERCEL: "1" }).enabled, false);
  });

  it("reports skipped (SourceNotConfiguredError) when disabled", async () => {
    const adapter = new AutocompleteAdapter(config({ enabled: false }));
    await assert.rejects(adapter.collect({ query: "keto diet", limit: 10 }), SourceNotConfiguredError);
    assert.equal((await adapter.healthCheck()).ok, false);
  });
});

describe("expansion + parsing", () => {
  it("sends A to Z to Google only", () => {
    assert.equal(expansionPlan("keto diet", "google").length, 39);
    assert.equal(expansionPlan("keto diet", "amazon").length, 13);
    assert.ok(expansionPlan("keto diet", "bing").includes("how to keto diet"));
  });

  it("reads each engine's response shape", () => {
    assert.deepEqual(parseSuggestions("google", BODIES.google), ["keto diet", "keto diet plan", "keto diet food list"]);
    assert.deepEqual(parseSuggestions("ddg", BODIES.ddg), ["keto diet plan", "keto diet meaning"]);
    assert.deepEqual(parseSuggestions("amazon", BODIES.amazon), ["keto diet book", "keto diet plan"]);
    assert.deepEqual(parseSuggestions("bing", { unexpected: true }), []);
  });
});

describe("AutocompleteAdapter.collect", () => {
  it("merges engines per phrase, ranks by engine count, drops the seed and unrelated phrases", async () => {
    const adapter = new AutocompleteAdapter(config());
    const raw = await adapter.collect({ query: "Keto Diet", limit: 10 });
    const payloads = raw.map((r) => r.payload as SuggestionPayload);
    assert.equal(payloads[0].phrase, "keto diet plan");
    assert.deepEqual(payloads[0].engines, ["google", "youtube", "bing", "ddg", "amazon"]);
    assert.equal(payloads.some((p) => p.phrase === "keto diet"), false, "seed itself is not an idea");
    assert.equal(payloads.some((p) => p.phrase === "weight watchers"), false, "no shared word with the seed");
    assert.equal(payloads.some((p) => p.phrase === "how to keto diet"), false, "probe echo is not a suggestion");
    assert.equal(payloads.some((p) => p.phrase === "how to keto diet for beginners"), true);
    const list = payloads.find((p) => p.phrase === "keto diet food list");
    assert.deepEqual(list?.engines, ["google", "bing"]);

    const s = adapter.normalize(raw[0]);
    assert.equal(s.engagement.engine_count, 5);
    assert.equal(s.engagement.engines_ok, 5);
    assert.equal(s.author, "anonymous");
    assert.match(s.source_id, /^autocomplete:us:[0-9a-f]{24}:2026-10-24$/);
  });

  it("hashes seed and phrase together, so two seeds never share a row", async () => {
    const [first] = await new AutocompleteAdapter(config()).collect({ query: "keto diet", limit: 10 });
    const expected = createHash("sha256").update("keto diet|keto diet plan").digest("hex").slice(0, 24);
    assert.equal(first.externalId, `autocomplete:us:${expected}:2026-10-24`);
  });

  it("keeps going when one engine fails and fails when all do", async () => {
    const partial = await new AutocompleteAdapter(config({}, ["amazon"])).collect({ query: "keto diet", limit: 10 });
    assert.deepEqual((partial[0].payload as SuggestionPayload).enginesOk, ["google", "youtube", "bing", "ddg"]);
    const all = new AutocompleteAdapter(config({}, ["google", "youtube", "bing", "ddg", "amazon"]));
    await assert.rejects(all.collect({ query: "keto diet", limit: 10 }), /All suggest engines failed/);
  });
});

describe("AutocompleteAdapter per-scan region (Part 3.7)", () => {
  it("puts the scan's geo in every engine URL and in the ids", async () => {
    const urls: string[] = [];
    const base = config();
    const adapter = new AutocompleteAdapter({
      ...base,
      fetchFn: async (input, init) => (urls.push(String(input)), base.fetchFn(input, init)),
    });
    const items = await adapter.collect({ query: "keto diet", limit: 5, geo: "ca" });
    assert.ok(urls.some((u) => u.includes("suggestqueries") && u.includes("gl=ca")));
    assert.ok(urls.some((u) => u.includes("mkt=en-CA")));
    assert.ok(urls.some((u) => u.includes("kl=ca-en")));
    assert.ok(!urls.some((u) => u.includes("gl=us")));
    assert.ok(items.every((i) => i.externalId.startsWith("autocomplete:ca:")));
  });
});
