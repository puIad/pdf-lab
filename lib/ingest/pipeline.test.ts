// lib/ingest/pipeline.test.ts — ingest counts, dedup, degradation. Zero
// network, zero DB: adapters and storage are injected fakes.
// Run: `pnpm test` (node:test + node:assert, no extra dependencies).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runIngest, toSignalRow } from "./pipeline.ts";
import type { IngestDeps, SignalRow } from "./pipeline.ts";
import type { MarketSignal, SourceAdapter } from "../sources/types.ts";
import { SourceNotConfiguredError } from "../sources/types.ts";

function signal(source: string, externalId: string): MarketSignal {
  return {
    source,
    source_id: externalId,
    url: `https://example.com/item/${externalId}`,
    title: `title ${externalId}`,
    text: `text ${externalId}`,
    author: "anonymous",
    timestamp: null,
    engagement: {},
    market_candidates: [],
    intent: null,
    pain_points: [],
  };
}

function fakeAdapter(
  key: string,
  items: Array<{ externalId: string }>,
  opts?: { fail?: string; notConfigured?: boolean },
): SourceAdapter {
  return {
    key,
    displayName: `Fake ${key}`,
    tiers: 1,
    collect: async ({ query }) => {
      assert.ok(query.length > 0);
      if (opts?.notConfigured) throw new SourceNotConfiguredError(`${key} has no key`);
      if (opts?.fail) throw new Error(opts.fail);
      return items.map(({ externalId }) => ({
        source: key,
        externalId,
        fetchedAt: new Date().toISOString(),
        payload: { externalId },
      }));
    },
    normalize: (raw) => signal(key, raw.externalId),
    healthCheck: async () => ({ ok: !opts?.fail && !opts?.notConfigured }),
  };
}

/** In-memory stand-in for the signals table incl. (source_id, external_id) dedup. */
function fakeDeps(adapters: SourceAdapter[]): IngestDeps & { rows: SignalRow[] } {
  const rows: SignalRow[] = [];
  const seen = new Set<string>();
  return {
    rows,
    adapters,
    resolveSourceId: async (key) => `uuid-for-${key}`,
    upsertSignals: async (batch) => {
      let inserted = 0;
      for (const row of batch) {
        const k = `${row.source_id}|${row.external_id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(row);
        inserted += 1;
      }
      return inserted;
    },
  };
}

describe("runIngest", () => {
  it("collects across adapters and reports per-source counts", async () => {
    const deps = fakeDeps([
      fakeAdapter("alpha", [{ externalId: "a1" }, { externalId: "a2" }]),
      fakeAdapter("beta", [{ externalId: "b1" }]),
    ]);
    const summary = await runIngest({ query: "pc troubleshooting", limit: 10 }, deps);
    assert.equal(summary.query, "pc troubleshooting");
    assert.equal(summary.sources.length, 2);
    assert.ok(summary.sources.every((s) => s.status === "ok"));
    assert.deepEqual(summary.totals, { collected: 3, normalized: 3, inserted: 3, duplicates: 0 });
    assert.equal(deps.rows.length, 3);
  });

  it("reruns insert ~0 duplicates (DB-level dedup)", async () => {
    const deps = fakeDeps([fakeAdapter("alpha", [{ externalId: "a1" }])]);
    const first = await runIngest({ query: "q", limit: 5 }, deps);
    assert.equal(first.totals.inserted, 1);
    const second = await runIngest({ query: "q", limit: 5 }, deps);
    assert.deepEqual(second.totals, { collected: 1, normalized: 1, inserted: 0, duplicates: 1 });
    assert.equal(deps.rows.length, 1);
  });

  it("a dead adapter fails honestly while the rest complete", async () => {
    const deps = fakeDeps([
      fakeAdapter("good", [{ externalId: "g1" }]),
      fakeAdapter("bad", [{ externalId: "x" }], { fail: "upstream exploded" }),
      fakeAdapter("unkeyed", [{ externalId: "y" }], { notConfigured: true }),
    ]);
    const summary = await runIngest({ query: "q", limit: 5 }, deps);
    const byKey = Object.fromEntries(summary.sources.map((s) => [s.key, s]));
    assert.equal(byKey.good?.status, "ok");
    assert.equal(byKey.bad?.status, "failed");
    assert.ok(byKey.bad?.error?.includes("upstream exploded"));
    assert.equal(byKey.unkeyed?.status, "skipped");
    assert.ok(byKey.unkeyed?.error?.includes("no key"));
    assert.equal(summary.totals.inserted, 1);
  });

  it("missing sources row fails that source with a migration hint", async () => {
    const deps = fakeDeps([fakeAdapter("ghost", [{ externalId: "g1" }])]);
    deps.resolveSourceId = async () => null;
    const summary = await runIngest({ query: "q", limit: 5 }, deps);
    assert.equal(summary.sources[0]?.status, "failed");
    assert.ok(summary.sources[0]?.error?.includes("seed migration"));
  });

  it("filters to requested source keys and rejects unknown ones", async () => {
    const deps = fakeDeps([
      fakeAdapter("alpha", [{ externalId: "a1" }]),
      fakeAdapter("beta", [{ externalId: "b1" }]),
    ]);
    const summary = await runIngest({ query: "q", limit: 5, sourceKeys: ["beta"] }, deps);
    assert.equal(summary.sources.length, 1);
    assert.equal(summary.sources[0]?.key, "beta");
    await assert.rejects(
      runIngest({ query: "q", sourceKeys: ["nope"] }, deps),
      /unknown source keys: nope/,
    );
  });

  it("rejects an empty query", async () => {
    await assert.rejects(runIngest({ query: "   " }, fakeDeps([])), /non-empty query/);
  });

  it("hands stored signals to the sink, and nothing from failed sources", async () => {
    const deps = fakeDeps([
      fakeAdapter("alpha", [{ externalId: "a1" }, { externalId: "a2" }]),
      fakeAdapter("broken", [], { fail: "upstream 500" }),
    ]);
    const got: Record<string, string[]> = {};
    await runIngest({ query: "q", limit: 5 }, deps, (key, signals) => {
      got[key] = signals.map((s) => s.source_id);
    });
    assert.deepEqual(got, { alpha: ["a1", "a2"] });
  });
});

describe("toSignalRow", () => {
  it("maps MarketSignal to the signals table shape", () => {
    const row = toSignalRow("uuid-1", signal("web", "x"));
    assert.deepEqual(row, {
      source_id: "uuid-1",
      external_id: "x",
      url: "https://example.com/item/x",
      title: "title x",
      content: "text x",
      published_at: null,
      engagement: {},
    });
  });
});
