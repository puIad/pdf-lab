// lib/launch/cost-model.test.ts — the cost model's call counts match the adapters, and its sums.
// Run: `pnpm test` (node:test, zero network).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EtsyAdapter } from "../sources/etsy/etsy-adapter.ts";
import { GumroadAdapter } from "../sources/gumroad/gumroad-adapter.ts";
import { KdpAdapter } from "../sources/kdp/kdp-adapter.ts";
import { CEILING, EXPECTED, SERPER_CALLS, monthlyCostAtLimit, projectCostPerAction, projectMonthly, userKeyCostPerAction } from "./cost-model.ts";

function counting() {
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    return new Response(JSON.stringify({ organic: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchFn, count: () => calls };
}

describe("serper calls per source", () => {
  it("each marketplace adapter makes one call per collect (web does too: web-adapter.test.ts)", async () => {
    const counts: Record<string, number> = {};
    for (const [name, make] of [
      ["etsy", (f: typeof fetch) => new EtsyAdapter({ apiKey: "k", fetchFn: f, minIntervalMs: 0 })],
      ["gumroad", (f: typeof fetch) => new GumroadAdapter({ apiKey: "k", fetchFn: f, minIntervalMs: 0 })],
      ["kdp", (f: typeof fetch) => new KdpAdapter({ apiKey: "k", fetchFn: f, minIntervalMs: 0 })],
    ] as const) {
      const c = counting();
      await make(c.fetchFn as unknown as typeof fetch).collect({ query: "meal prep", limit: 10 });
      counts[name] = c.count();
    }
    assert.deepEqual(counts, { etsy: 1, gumroad: 1, kdp: 1 });
    assert.equal(SERPER_CALLS.check, counts.etsy + counts.gumroad + counts.kdp);
    assert.equal(SERPER_CALLS.deep, 1 + SERPER_CALLS.check); // web plus the three marketplaces
    assert.equal(SERPER_CALLS.exploration, 1); // web only
  });
});

describe("cost per action", () => {
  it("a free Deep run costs the project only its search calls; premium adds the hosted AI", () => {
    assert.ok(Math.abs(projectCostPerAction("deep", "free") - 0.004) < 1e-12);
    assert.ok(Math.abs(projectCostPerAction("deep", "byok") - 0.004) < 1e-12);
    assert.ok(Math.abs(projectCostPerAction("deep", "premium") - 0.014) < 1e-12);
  });

  it("BYOK moves the AI cost to the person's key", () => {
    assert.equal(userKeyCostPerAction("deep", "byok"), 0.01);
    assert.equal(userKeyCostPerAction("deep", "free"), 0);
    assert.equal(userKeyCostPerAction("deep", "premium"), 0);
  });

  it("monthly cost at the limit sums every kind over a 30 day month", () => {
    // free: 5 scans x 1 + 20 checks x 3 + 1 deep x 4 = 69 calls
    assert.ok(Math.abs(monthlyCostAtLimit("free", "free") - 0.069) < 1e-9);
    // premium: 100 x 1 + 300 x 3 + 12 x 4 = 1048 calls, plus 12 hosted Deep runs at $0.01
    assert.ok(Math.abs(monthlyCostAtLimit("premium", "premium") - 1.168) < 1e-9);
  });
});

describe("projection", () => {
  it("scales linearly with users and the expected case is below the ceiling", () => {
    assert.ok(Math.abs(projectMonthly(1000, CEILING) - 10 * projectMonthly(100, CEILING)) < 1e-9);
    assert.ok(projectMonthly(1000, EXPECTED) < projectMonthly(1000, CEILING));
    assert.equal(projectMonthly(0, CEILING), 0);
  });

  it("the ceiling at 100 users is 95 free plus 5 premium people", () => {
    assert.ok(Math.abs(projectMonthly(100, CEILING) - (95 * 0.069 + 5 * 1.168)) < 1e-9);
  });
});
