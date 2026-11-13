// lib/opportunities/match.test.ts — Part 6.8: evidence that belongs to the opportunity.

import test from "node:test";
import assert from "node:assert/strict";
import { matchSignals, MAX_EVIDENCE_SIGNALS, MIN_TOKEN_MATCH, problemOverlap } from "./match.ts";
import type { OpportunitySignalInput } from "./types.ts";

const sig = (id: string, problem: string, embedding?: number[]): OpportunitySignalInput => ({
  id,
  source_id: "src",
  source_type: "reddit",
  title: problem,
  content: problem,
  url: `https://x/${id}`,
  analysis: { audience: "households", problem },
  embedding,
});

test("ranks the market's signals by embedding similarity to the candidate's own signals", () => {
  const own = sig("own", "cannot pay down credit card debt", [1, 0, 0]);
  const near = sig("near", "credit card balance keeps growing", [0.95, 0.31, 0]);
  const far = sig("far", "weekly grocery bill too high", [0, 1, 0]);
  const match = matchSignals(own.analysis!.problem!, [own], [far, near, own]);
  assert.deepEqual(match.signals.map((s) => s.id), ["own", "near"]);
  assert.equal(match.matchCount, 2);
  assert.equal(match.marketTotal, 3);
});

test("falls back to shared words when embeddings are missing", () => {
  const own = sig("own", "cannot pay down credit card debt");
  const near = sig("near", "credit card debt keeps growing");
  const far = sig("far", "weekly grocery bill too high");
  const match = matchSignals(own.analysis!.problem!, [own], [own, near, far]);
  assert.deepEqual(match.signals.map((s) => s.id), ["own", "near"]);
});

test("keeps at most five signals but counts every match", () => {
  const own = sig("own", "debt", [1, 0]);
  const market = [own, ...Array.from({ length: 8 }, (_, i) => sig(`n${i}`, "debt", [1, 0.01 * i]))];
  const match = matchSignals("debt", [own], market);
  assert.equal(match.signals.length, MAX_EVIDENCE_SIGNALS);
  assert.equal(match.signals[0].id, "own");
  assert.equal(match.matchCount, 9);
});

test("a long post title does not hide a problem stated word for word (PR #13 review)", () => {
  const longTitle = {
    ...sig("long", "overspending on groceries"),
    title: "We sat down last night after the kids went to bed and went through three months of bank statements line by line",
  };
  assert.equal(problemOverlap("overspending on groceries", longTitle), 1);
  // A paraphrase sharing half of the problem's words still matches; an unrelated signal does not.
  assert.ok(problemOverlap("rent takes the whole budget", sig("p", "the budget goes to rent every month")) >= MIN_TOKEN_MATCH);
  assert.ok(problemOverlap("rent takes the whole budget", sig("u", "weekly grocery bill too high")) < MIN_TOKEN_MATCH);
  assert.equal(problemOverlap("", longTitle), 0);
});

