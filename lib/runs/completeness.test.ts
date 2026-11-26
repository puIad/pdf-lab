// lib/runs/completeness.test.ts — fetchRunCompleteness counts every row of a run past PostgREST's 1000-row cap.
// Run: `pnpm test` (node:test, zero network, zero DB).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cappedSupabase } from "../db/capped-supabase.test-helpers.ts";
import { fetchRunCompleteness } from "./completeness.ts";

const N = 1200;
const ids = (prefix: string) => Array.from({ length: N }, (_, i) => `${prefix}${i}`);

describe("fetchRunCompleteness", () => {
  it("counts a run's signals, markets and opportunities past 1000 rows", async () => {
    const supabase = cappedSupabase({
      run_signals: ids("s").map((id) => ({
        run_id: "r1",
        signal_id: id,
        signals: { id, source_id: "src", external_id: id, sources: { type: "reddit" }, signal_analysis: { id: `a-${id}` } },
      })),
      markets: ids("m").map((id) => ({ id, run_id: "r1" })),
      opportunities: ids("o").map((id) => ({ id, run_id: "r1" })),
    });
    const c = await fetchRunCompleteness(supabase, "r1");
    assert.equal(c.signalsCollected, N);
    assert.equal(c.signalsAnalyzed, N);
    assert.equal(c.marketsIdentified, N);
    assert.equal(c.opportunitiesGenerated, N);
    assert.equal(c.signalsNotClustered, N);
  });
});
