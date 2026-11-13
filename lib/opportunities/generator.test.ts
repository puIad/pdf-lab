// lib/opportunities/generator.test.ts — Unit and invariant tests for the opportunity generator.

import test from "node:test";
import assert from "node:assert/strict";
import {
  distinctEvidenceSets,
  evidenceSignalType,
  generate25Opportunities,
  generateCandidatePool,
  IDEA_CLAIM_PREFIX,
  ideaCandidates,
  observedPriceRange,
  pickDistinctIdeas,
  type OpportunityMarketInput,
  type OpportunitySignalInput,
} from "./index.ts";
import type { AIRouter } from "../ai/router.ts";
import { enforceRule1_OpportunityEvidence, QCViolationError } from "../evidence/qc.ts";
import { buildIdeas } from "../ideas/ideas.ts";

function createMockMarkets(): OpportunityMarketInput[] {
  return [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Boot & Power Delivery Failures",
      demandScore: 82,
      confidence: 0.78,
      pdfFitScore: 90,
      signals: [
        {
          id: "sig-1",
          source_id: "src-1",
          source_type: "reddit",
          title: "PC won't boot after BIOS update, power LED blinks orange",
          content: "I updated the BIOS and now it powers on for 2 seconds and shuts off. Fans spin then stop.",
          url: "https://reddit.com/r/buildapc/1",
          published_at: "2026-09-15T12:00:00Z",
          analysis: {
            audience: "Budget PC Builders & Upgraders",
            problem: "BIOS update bricking power delivery and boot sequence",
            intent: "very_strong",
            urgency: "high",
            pdf_relevance: 0.95,
          },
        },
        {
          id: "sig-2",
          source_id: "src-2",
          source_type: "web",
          title: "Complete motherboard power supply tester troubleshooting guide",
          content: "Paperclip test on 24-pin ATX connector, testing 12V rails with multimeter, checking standby voltage.",
          url: "https://tomshardware.com/psu-test",
          published_at: "2026-09-16T10:00:00Z",
          analysis: {
            audience: "IT Support Specialists & Helpdesk Technicians",
            problem: "PSU failure isolation and ATX pinout diagnostic",
            intent: "strong",
            urgency: "high",
            pdf_relevance: 0.9,
          },
        },
      ],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Display & GPU Diagnostic Issues",
      demandScore: 76,
      confidence: 0.72,
      pdfFitScore: 85,
      signals: [
        {
          id: "sig-3",
          source_id: "src-1",
          source_type: "reddit",
          title: "Black screen on game launch after NVIDIA driver 560 update",
          content: "Whenever I boot Cyberpunk or Counter-Strike, monitor loses signal. DisplayPort cable works in safe mode.",
          url: "https://reddit.com/r/techsupport/2",
          published_at: "2026-09-17T14:00:00Z",
          analysis: {
            audience: "Competitive Gamers & Streamers",
            problem: "GPU driver crash and display signal loss under 3D load",
            intent: "strong",
            urgency: "medium",
            pdf_relevance: 0.88,
          },
        },
      ],
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Thermal Management & Overheating",
      demandScore: 68,
      confidence: 0.65,
      pdfFitScore: 80,
      signals: [
        {
          id: "sig-4",
          source_id: "src-1",
          source_type: "reddit",
          title: "CPU temps hitting 95C at idle, AIO cooler pump noise",
          content: "Liquid cooler pump making grinding sound. Cleaned thermal paste and remounted bracket twice.",
          url: "https://reddit.com/r/buildapc/3",
          published_at: "2026-09-18T09:00:00Z",
          analysis: {
            audience: "Remote Workers & Home Office Professionals",
            problem: "CPU thermal throttling and AIO cooler airlock diagnostic",
            intent: "medium",
            urgency: "high",
            pdf_relevance: 0.85,
          },
        },
      ],
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      name: "Wi-Fi & Network Adapter Troubleshooting",
      demandScore: 70,
      confidence: 0.68,
      pdfFitScore: 88,
      signals: [
        {
          id: "sig-5",
          source_id: "src-2",
          source_type: "web",
          title: "Windows 11 Wi-Fi drops every 10 minutes router isolation checklist",
          content: "DNS probe finished no internet, adapter power management turning off device to save power fix.",
          url: "https://answers.microsoft.com/wifi-drops",
          published_at: "2026-09-18T18:00:00Z",
          analysis: {
            audience: "Students & Academic Researchers",
            problem: "Intermittent Wi-Fi disconnects and power-saving adapter sleep",
            intent: "strong",
            urgency: "high",
            pdf_relevance: 0.92,
          },
        },
      ],
    },
  ];
}

/** Part 6.4: nothing in a non-PC run may carry the old PC template text. */
const PC_TEXT = /\b(pc|bios|gamers?|repair shop|hardware|boot)\b/i;

// SAMPLE DATA (fixture rule): a budgeting niche, shaped like stored signals + signal_analysis rows.
function createBudgetMarkets(): OpportunityMarketInput[] {
  const sig = (id: string, title: string, audience: string | null, problem: string | null, urgency: string | null) => ({
    id,
    source_id: `src-${id}`,
    source_type: "reddit",
    title,
    content: `${title}. Looking for something I can actually stick to.`,
    url: `https://reddit.com/r/personalfinance/${id}`,
    published_at: "2026-10-20T12:00:00Z",
    analysis: audience || problem ? { audience, problem, intent: "strong", urgency, pdf_relevance: 0.8 } : null,
  });
  return [
    {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      name: "Monthly Budget Overspending",
      demandScore: 71,
      confidence: 0.6,
      priceRange: "$4.99–$19",
      signals: [
        sig("b1", "I blow my grocery budget every month", "young couples", "Grocery spending exceeds the monthly plan", "high"),
        sig("b2", "Same here, groceries wreck our plan", "young couples", "Grocery spending exceeds the monthly plan", "medium"),
        sig("b3", "Need a weekly spending checklist", "college students", "No simple way to track weekly spending", "low"),
        sig("b4", "Random post with no extraction", null, null, null),
      ],
    },
    {
      id: "aaaaaaaa-0000-0000-0000-000000000002",
      name: "Irregular Income Planning",
      demandScore: 55,
      confidence: 0.4,
      signals: [
        sig("b5", "Freelancer here, income changes monthly", "freelancers", "Cannot cover bills when income is irregular", null),
      ],
    },
    { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "Unanalysed Market", demandScore: 40, confidence: 0.2, signals: [sig("b6", "Untitled", null, null, null)] },
  ];
}

test("Opportunity generator: observed fields only, never padded (Part 6.4)", async (t) => {
  const markets = createBudgetMarkets();
  const analysed = markets.flatMap((m) => m.signals).filter((s) => s.analysis);

  await t.test("one candidate per distinct (audience, problem); unanalysed signals yield none", () => {
    const pool = generateCandidatePool(markets);
    assert.equal(pool.length, 3);
    assert.deepEqual(pool.map((c) => c.marketId), [markets[0].id, markets[0].id, markets[1].id]);
  });

  await t.test("a non-PC run contains no PC template text", async () => {
    const res = await generate25Opportunities(markets);
    assert.doesNotMatch(JSON.stringify(res), PC_TEXT);
  });

  await t.test("thin markets give fewer than 25: the count equals what the pool supports", async () => {
    const res = await generate25Opportunities(markets);
    assert.equal(res.targetCount, 25);
    assert.equal(res.opportunities.length, 3);
    assert.equal(res.totalCandidatesGenerated, 3);
    const empty = await generate25Opportunities([{ id: "e", name: "Empty", demandScore: 50, confidence: 0.5, signals: [] }]);
    assert.equal(empty.opportunities.length, 0);
    assert.equal((await generate25Opportunities([])).opportunities.length, 0);
  });

  await t.test("audience, problem and urgency trace to a stored row; price is observed or null", () => {
    for (const c of generateCandidatePool(markets)) {
      const src = analysed.filter((s) => s.analysis!.audience === c.targetAudience && s.analysis!.problem === c.problem);
      assert.ok(src.length > 0, `no signal behind ${c.title}`);
      assert.equal(c.evidence.length, Math.min(3, src.length));
      assert.ok(c.evidence.every((e) => e.entityId === c.id && src.some((s) => s.url === e.url && e.sourceId === s.source_id)));
      assert.equal(c.sophistication, null);
      assert.equal(c.mechanism, null);
      assert.equal(c.outcome, null);
    }
    const [couples, students, freelancers] = generateCandidatePool(markets);
    assert.equal(couples.urgency, "high"); // highest of high + medium
    assert.equal(students.urgency, "low");
    assert.equal(freelancers.urgency, null); // none stored
    assert.equal(couples.priceRange, "$4.99–$19"); // the market's observed range
    assert.equal(freelancers.priceRange, null); // no stored competitor prices
    assert.equal(students.format, "checklist"); // the signal's wording names the format
    assert.equal(freelancers.format, "guide");
  });

  await t.test("selection keeps (audience, problem, format) distinct and caps a format at 36%", async () => {
    const many: OpportunityMarketInput[] = [{
      id: "big",
      name: "Big",
      demandScore: 60,
      confidence: 0.5,
      signals: Array.from({ length: 40 }, (_, i) => ({
        id: `s${i}`,
        source_id: "src-1",
        title: i % 2 ? `budget planner ${i}` : `saving checklist ${i}`,
        content: null,
        url: `https://example.com/${i}`,
        analysis: { audience: `audience ${i % 10}`, problem: `problem number ${i}` },
      })),
    }];
    const res = await generate25Opportunities(many);
    assert.equal(res.opportunities.length, 25);
    assert.equal(new Set(res.opportunities.map((o) => `${o.targetAudience}::${o.problem}::${o.format}`)).size, 25);
    // Two formats exist in the data, so the cap relaxes only after both reach 9.
    for (const n of Object.values(res.diversification.formatCounts)) assert.ok(n === 0 || n >= 9);
    assert.deepEqual(res.diversification.priceRanges, []);
  });

  await t.test("QC Rule 1: every opportunity has evidence rows of its own", async () => {
    const res = await generate25Opportunities(markets);
    for (const opp of res.opportunities) {
      assert.ok(opp.evidence.length >= 1, `Opp ${opp.title} has 0 evidence rows`);
      for (const ev of opp.evidence) {
        assert.equal(ev.entityType, "opportunity");
        assert.equal(ev.entityId, opp.id);
        assert.ok(ev.claim.length > 0);
      }
    }
    assert.throws(
      () => enforceRule1_OpportunityEvidence({ id: "x", title: "No evidence" }, []),
      (err) => err instanceof QCViolationError && err.ruleNumber === 1,
    );
  });

  await t.test("deterministic: the same stored rows give the same set", async () => {
    const a = await generate25Opportunities(markets);
    const b = await generate25Opportunities(markets);
    assert.deepEqual(
      a.opportunities.map((o) => [o.title, o.format, o.targetAudience, o.opportunityScore]),
      b.opportunities.map((o) => [o.title, o.format, o.targetAudience, o.opportunityScore]),
    );
  });

  await t.test("observedPriceRange reads paid prices in the most common currency", () => {
    assert.equal(observedPriceRange(["$4.99", "$19.00", "Free", null, "£3"]), "$4.99–$19");
    assert.equal(observedPriceRange(["$7"]), "$7");
    assert.equal(observedPriceRange(["Free", null, "n/a"]), null);
    assert.equal(observedPriceRange([]), null);
  });
});

test("Evidence belongs to the opportunity (Part 6.8)", async (t) => {
  const sig = (id: string, audience: string, problem: string, embedding: number[], extra: Partial<OpportunitySignalInput> = {}): OpportunitySignalInput => ({
    id,
    source_id: "src-reddit",
    source_type: "reddit",
    title: problem,
    content: `${problem} (post ${id})`,
    url: `https://reddit.com/${id}`,
    analysis: { audience, problem },
    embedding,
    ...extra,
  });
  // One tight cluster: every signal is within the embedding threshold of every other.
  const tight: OpportunityMarketInput = {
    id: "m-tight",
    name: "Monthly budgeting",
    demandScore: 60,
    confidence: 0.6,
    signals: [
      sig("a1", "couples", "overspending on groceries", [1, 0.02]),
      sig("a2", "couples", "overspending on groceries", [1, 0.03]),
      sig("b1", "students", "rent takes the whole budget", [1, 0.04]),
      sig("b2", "students", "rent takes the whole budget", [1, 0.05]),
      sig("c1", "freelancers", "irregular income", [1, 0.06]),
    ],
  };
  const evidenceKey = (o: { evidence: Array<{ url?: string | null }> }) => o.evidence.map((e) => e.url).sort().join("|");

  await t.test("no two opportunities with different problems cite the identical evidence set", async () => {
    const res = await generate25Opportunities([tight]);
    assert.equal(res.opportunities.length, 3);
    assert.equal(new Set(res.opportunities.map(evidenceKey)).size, 3);
    for (const o of res.opportunities) {
      assert.ok(o.evidence.length >= 1 && o.evidence.length <= 5);
      assert.equal(o.marketSignals, 5);
      assert.equal(o.matchingSignals, 5); // QC Rule 4 count: every signal of this cluster matches
    }
  });

  await t.test("a market of 3 signals or fewer may share its evidence", async () => {
    const small = { ...tight, id: "m-small", signals: [tight.signals[0], tight.signals[2], tight.signals[4]] };
    const res = await generate25Opportunities([small]);
    assert.equal(res.opportunities.length, 3);
    assert.equal(new Set(res.opportunities.map(evidenceKey)).size, 1);
  });

  await t.test("evidence is the signals about this problem, not the market's first rows", () => {
    const market: OpportunityMarketInput = {
      id: "m-wide",
      name: "Money",
      demandScore: 50,
      confidence: 0.5,
      signals: [
        sig("g1", "couples", "overspending on groceries", [1, 0, 0]),
        sig("g2", "parents", "grocery bill keeps growing", [0.96, 0.28, 0]),
        sig("r1", "students", "rent takes the whole budget", [0, 1, 0]),
        sig("r2", "renters", "rent increase every year", [0.1, 0.99, 0]),
      ],
    };
    const pool = generateCandidatePool([market]);
    const groceries = pool.find((c) => c.problem === "overspending on groceries")!;
    assert.deepEqual(groceries.evidence.map((e) => e.url), ["https://reddit.com/g1", "https://reddit.com/g2"]);
    assert.equal(groceries.matchingSignals, 2);
    assert.equal(groceries.marketSignals, 4);
    const rent = pool.find((c) => c.problem === "rent takes the whole budget")!;
    assert.deepEqual(rent.evidence.map((e) => e.url), ["https://reddit.com/r1", "https://reddit.com/r2"]);
  });

  await t.test("a candidate with no sourced evidence row is dropped, not saved", async () => {
    const market: OpportunityMarketInput = {
      id: "m-src",
      name: "Money",
      demandScore: 50,
      confidence: 0.5,
      signals: [
        sig("ok", "couples", "overspending on groceries", [1, 0]),
        sig("nosrc", "students", "rent takes the whole budget", [0, 1], { source_id: null }),
        sig("bare", "freelancers", "irregular income", [0.7, -0.7], { url: null, content: null }),
      ],
    };
    const res = await generate25Opportunities([market]);
    assert.deepEqual(res.opportunities.map((o) => o.problem), ["overspending on groceries"]);
    for (const o of res.opportunities) assert.doesNotThrow(() => enforceRule1_OpportunityEvidence(o, o.evidence));
  });

  await t.test("signal type follows the signal: pain_point only when a problem was extracted", () => {
    assert.equal(evidenceSignalType({ source_type: "reddit", analysis: { problem: "rent is too high" } }), "pain_point");
    assert.equal(evidenceSignalType({ source_type: "gtrends", analysis: null }), "gtrends");
    assert.equal(evidenceSignalType({ source_type: "web", analysis: { problem: "  " } }), "web");
    assert.equal(evidenceSignalType({}), "general");
  });

  await t.test("distinctEvidenceSets: a second problem on the same set falls back to its own signals, a third is dropped", () => {
    const base = generateCandidatePool([tight]);
    const same = { evidenceSignalIds: base[0].evidenceSignalIds, ownSignalIds: base[0].ownSignalIds };
    const second = { ...base[0], id: "second", problem: "a second problem", ...same };
    const third = { ...base[0], id: "third", problem: "a third problem", ...same };
    const out = distinctEvidenceSets([base[0], second, third], new Map([[tight.id, 5]]));
    assert.deepEqual(out.map((c) => c.id), [base[0].id, "second"]);
    assert.deepEqual(out[1].evidenceSignalIds, ["a1", "a2"]);
    assert.equal(out[1].evidence.length, 2);
  });
});

test("AI path: model wording, stored grounding, no defaults, no padding (Part 6.4)", async (t) => {
  const markets = createBudgetMarkets();
  const routerReturning = (raw: unknown) =>
    ({ generateObject: async (o: { validate: (r: unknown) => unknown }) => ({ object: o.validate(raw) }) }) as unknown as AIRouter;
  const ok = {
    marketId: markets[0].id,
    title: "Grocery Budget Reset",
    targetAudience: "young couples",
    problem: "Grocery spending exceeds the monthly plan",
    solution: "A weekly grocery planner",
    format: "planner",
  };

  await t.test("keeps only candidates grounded in the market's signals; the observed pool always joins", async () => {
    const res = await generate25Opportunities(markets, {
      router: routerReturning([
        ok,
        { ...ok, marketId: "not-in-input", title: "Wrong market" },
        { ...ok, solution: "", title: "No solution" },
        { ...ok, format: "video course", title: "Bad format" },
        { ...ok, targetAudience: "Competitive Gamers", title: "Made-up audience" },
        { ...ok, marketId: markets[2].id, title: "Market without analysed signals" },
        {
          ...ok,
          title: "Fine wording",
          targetAudience: "College Students",
          problem: "No simple way to track weekly spending",
          format: "tracker",
          sophistication: "expert",
          outcome: "Spend under plan",
        },
      ]),
    });
    // 2 model candidates, then the pool's 3 minus the one sharing (audience, problem, format) with the first.
    assert.deepEqual(res.opportunities.map((o) => o.title).slice(0, 2), ["Grocery Budget Reset", "Fine wording"]);
    assert.equal(res.opportunities.length, 4);
    assert.equal(res.totalCandidatesGenerated, 4);
    const [first, second] = res.opportunities;
    assert.equal(first.priceRange, "$4.99–$19"); // observed on the market, never the model's
    assert.equal(first.urgency, "high"); // from the young-couples signals
    assert.deepEqual(first.evidence.map((e) => e.sourceId), ["src-b1", "src-b2"]);
    assert.equal(first.sophistication, null);
    assert.equal(first.mechanism, null);
    assert.equal(second.targetAudience, "college students"); // stored wording, not the model's
    assert.equal(second.urgency, "low"); // from the college-students signal, not the market's first three
    assert.deepEqual(second.evidence.map((e) => e.sourceId), ["src-b3"]);
    assert.equal(second.sophistication, null); // "expert" is not a level
    assert.equal(second.outcome, "Spend under plan");
    assert.doesNotMatch(JSON.stringify(res), PC_TEXT);
  });

  await t.test("no usable model candidate, or a provider error, leaves the observed pool", async () => {
    const none = await generate25Opportunities(markets, { router: routerReturning([{ title: "only a title" }]) });
    assert.equal(none.opportunities.length, 3);
    const failing = { generateObject: async () => { throw new Error("provider down"); } } as unknown as AIRouter;
    assert.equal((await generate25Opportunities(markets, { router: failing })).opportunities.length, 3);
  });

  await t.test("the model is not called when no signal has both an audience and a problem", async () => {
    let calls = 0;
    const counting = { generateObject: async () => { calls += 1; return { object: [] }; } } as unknown as AIRouter;
    const res = await generate25Opportunities([markets[2]], { router: counting });
    assert.equal(calls, 0);
    assert.equal(res.opportunities.length, 0);
  });
});

test("Part 3.8: quick ideas join the Deep-run candidate pool", async (t) => {
  const markets = createMockMarkets();
  // SAMPLE DATA shaped like stored Serper phrase rows (fixture rule).
  const phrase = (p: string, best: number) => ({
    source: "web",
    source_id: `serp:us:${p}`,
    url: `https://www.google.com/search?q=${encodeURIComponent(p)}`,
    title: p,
    text: null,
    author: null,
    timestamp: null,
    engagement: { seed: "pc troubleshooting", phrase: p, serp_blocks: "paa", block_count: 1, blocks_total: 2, best_position: best },
    market_candidates: [],
    intent: null,
    pain_points: [],
  });
  const ideas = buildIdeas("pc troubleshooting", [
    phrase("how to fix a pc that won't boot", 0),
    phrase("how to fix pc that won't boot", 1), // near-duplicate of the first
    phrase("pc troubleshooting checklist", 2),
    phrase("why does my gpu crash", 3),
  ]).ideas;
  const refs = new Map(ideas.flatMap((i) => i.evidence).map((e) => [e.source_id, { sourceUuid: "src-web", excerpt: e.title }]));

  await t.test("near-duplicates dropped by token overlap; at most 20 kept", () => {
    const picked = pickDistinctIdeas(ideas);
    assert.equal(picked.length, 3);
    assert.ok(pickDistinctIdeas([...ideas, ...ideas], 2).length <= 2);
  });

  await t.test("each candidate cites its phrase rows and maps to a known market", () => {
    const cands = ideaCandidates("pc troubleshooting", ideas, markets, refs);
    const ids = new Set(markets.map((m) => m.id));
    for (const c of cands) {
      assert.ok(ids.has(c.marketId));
      assert.ok(c.evidence.length > 0);
      assert.ok(c.evidence.every((e) => e.entityId === c.id && e.claim.startsWith(IDEA_CLAIM_PREFIX) && e.sourceId === "src-web"));
    }
    assert.equal(ideaCandidates("x", ideas, [], refs).length, 0); // no market, no candidate
  });

  await t.test("ideas join the pool; the count is what the pool supports, all distinct, one traced to a phrase", async () => {
    const extra = ideaCandidates("pc troubleshooting", ideas, markets, refs);
    const res = await generate25Opportunities(markets, { targetCount: 25, extraCandidates: extra });
    assert.equal(res.opportunities.length, Math.min(25, generateCandidatePool(markets).length + extra.length));
    const keys = new Set(res.opportunities.map((o) => `${o.targetAudience}::${o.problem}::${o.format}`));
    assert.equal(keys.size, res.opportunities.length);
    assert.ok(res.opportunities.some((o) => o.evidence.some((e) => e.claim.startsWith(IDEA_CLAIM_PREFIX))));
    assert.ok(extra.every((c) => c.urgency === null && c.sophistication === null && c.priceRange === null));
  });
});
