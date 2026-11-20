import { test } from "node:test";
import assert from "node:assert/strict";
import { nicheTrendLine, summarizeNicheTrend } from "./niche.ts";

const iot = { avg_interest: 46, direction: "falling", points: 13, window_days: 90 };

test("summarizes the interest-over-time row, ignoring related queries and other sources", () => {
  const t = summarizeNicheTrend("r1", "pc troubleshooting", [
    { url: "u", engagement: iot, sources: { type: "gtrends" } },
    { url: "x", engagement: { seed: "pc troubleshooting", related_query: "a", interest_value: 80, rising: false }, sources: { type: "gtrends" } },
    { url: "y", engagement: { avg_interest: 99, seed: "s" }, sources: [{ type: "reddit" }] },
  ]);
  assert.equal(t?.count, 1);
  assert.equal(t?.avgInterest, 46);
  assert.equal(t?.direction, "falling");
  assert.match(nicheTrendLine(t!), /not a market's trend/);
});

test("no reading, no claim", () => {
  assert.equal(summarizeNicheTrend("r1", "pc troubleshooting", [{ url: null, engagement: { upvotes: 3 }, sources: { type: "reddit" } }]), null);
});
