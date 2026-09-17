// lib/sources/registry.test.ts — registry lookup contract (no network).
// Run: `pnpm test`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adapterKeys,
  getAdapter,
  listAdapters,
  registerAdapter,
} from "./registry.ts";
import type { SourceAdapter } from "./types.ts";

function fakeAdapter(key: string): SourceAdapter {
  return {
    key,
    displayName: `Fake ${key}`,
    tiers: 3,
    collect: async () => [],
    normalize: (raw) => ({
      source: key,
      source_id: raw.externalId,
      url: null,
      title: null,
      text: null,
      author: "anonymous",
      timestamp: null,
      engagement: {},
      market_candidates: [],
      intent: null,
      pain_points: [],
    }),
    healthCheck: async () => ({ ok: true, detail: "fake" }),
  };
}

describe("source registry", () => {
  it("registers, gets, and lists adapters by key", () => {
    const before = new Set(adapterKeys());
    registerAdapter(fakeAdapter("fake-test-source"));
    assert.ok(getAdapter("fake-test-source"));
    assert.equal(getAdapter("fake-test-source")?.displayName, "Fake fake-test-source");
    assert.ok(listAdapters().some((a) => a.key === "fake-test-source"));
    assert.equal(getAdapter("no-such-source"), undefined);
    assert.ok(before.size < adapterKeys().length);
  });

  it("rejects duplicate keys", () => {
    registerAdapter(fakeAdapter("fake-dup-source"));
    assert.throws(() => registerAdapter(fakeAdapter("fake-dup-source")), /already registered/);
  });
});
