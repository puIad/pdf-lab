// lib/db/read-all.test.ts — readAllIn keeps each request's id list short and still reads every row.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readAllIn } from "./read-all.ts";
import { cappedSupabase } from "./capped-supabase.test-helpers.ts";

describe("readAllIn", () => {
  it("sends at most 100 ids per request, pages each chunk, and merges the rows", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `m${i}`);
    // 3 rows per id = 1350 rows over 5 chunks; chunk 1 alone holds 300 rows.
    const rows = ids.flatMap((id) => [0, 1, 2].map((n) => ({ id: `${id}-${n}`, market_id: id })));
    const db = cappedSupabase({ t: rows });
    const sizes: number[] = [];
    const out = await readAllIn<{ id: string }>("t", ids, (chunk) => {
      sizes.push(chunk.length);
      return db.from("t").select("id").in("market_id", chunk).order("id");
    });
    assert.equal(out.length, 1350);
    assert.equal(new Set(out.map((r) => r.id)).size, 1350);
    assert.ok(sizes.every((n) => n <= 100));
    assert.equal(sizes.length, 5);
  });

  it("reads nothing, with no request, for an empty id list", async () => {
    let calls = 0;
    const out = await readAllIn("t", [], () => {
      calls++;
      throw new Error("no request expected");
    });
    assert.deepEqual(out, []);
    assert.equal(calls, 0);
  });
});
