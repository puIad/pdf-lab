// lib/competition/discussion.test.ts — which stored discussion a market's gaps may be mined from (issue #89).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discussionForMarket } from "./discussion.ts";

const markets = [
  { id: "m1", name: "Boot diagnostics and POST recovery", signalIds: ["own"], texts: [] },
  { id: "m2", name: "Slow startup cleanup", signalIds: [], texts: [] },
];
const sig = (id: string, title: string, source_type = "reddit") => ({ id, title, source_type });

describe("discussionForMarket", () => {
  it("keeps Reddit and YouTube signals on the market's topic, not its own signals, other topics or other sources", () => {
    const pool = [
      sig("own", "Boot diagnostics and POST recovery"),
      sig("a", "POST recovery and boot diagnostics help"),
      sig("yt", "Boot diagnostics and POST recovery walkthrough", "youtube"),
      sig("b", "Slow startup cleanup tips"),
      sig("web", "Boot diagnostics and POST recovery", "web"),
    ];
    assert.deepEqual(discussionForMarket("m1", markets, "pc troubleshooting", pool).map((s) => s.id), ["a", "yt"]);
  });
});
