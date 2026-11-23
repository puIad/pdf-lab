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
import { capIdeaOnlyScores } from "./generator.ts";
import { marketFor } from "./from-ideas.ts";
import { isUndescribedProblem } from "./match.ts";

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
    assert.equal(freelancers.format, null); // no format word in the wording: not observed, no default (issue #49)
    assert.match(freelancers.title, /^PDF for /);
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
    assert.equal(res.droppedUnsourced, 2);
    for (const o of res.opportunities) assert.doesNotThrow(() => enforceRule1_OpportunityEvidence(o, o.evidence));
  });

  await t.test("signal type follows the signal: pain_point only when a problem was extracted", () => {
    assert.equal(evidenceSignalType({ source_type: "reddit", analysis: { problem: "rent is too high" } }), "pain_point");
    assert.equal(evidenceSignalType({ source_type: "gtrends", analysis: null }), "gtrends");
    assert.equal(evidenceSignalType({ source_type: "web", analysis: { problem: "No specific PC fault is described; only advertises help." } }), "web");
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
    // 2 model candidates, then the pool's 3 minus the one sharing (audience, problem, format) with the
    // first, minus the college-students one the model's "Fine wording" already states in another format (#70).
    assert.deepEqual(res.opportunities.map((o) => o.title).slice(0, 2), ["Grocery Budget Reset", "Fine wording"]);
    assert.equal(res.opportunities.length, 3);
    assert.equal(res.totalCandidatesGenerated, 3);
    assert.equal(res.mergedSimilar, 1);
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

  await t.test("a model problem does not match a whole market through the words its signals share (Part 6.16)", async () => {
    const things = ["chicken", "recipes", "soups", "lunches", "breakfasts", "snacks"];
    const mealPrep: OpportunityMarketInput = {
      id: "bbbbbbbb-0000-0000-0000-000000000001",
      name: "Meal Prep",
      demandScore: 60,
      confidence: 0.5,
      signals: things.map((thing, i) => ({
        id: `m${i}`,
        source_id: `src-m${i}`,
        source_type: "web",
        title: `meal prep ${thing}`,
        content: "",
        url: `https://example.com/m${i}`,
        published_at: "2026-11-01T12:00:00Z",
        analysis: { audience: "home cooks", problem: `They look for ${thing} to meal prep.`, intent: "strong", urgency: "low", pdf_relevance: 0.8 },
      })),
    };
    const res = await generate25Opportunities([mealPrep], {
      router: routerReturning([{ ...ok, marketId: mealPrep.id, title: "Chicken Prep Plan", targetAudience: "home cooks", problem: "Meal prep chicken ideas" }]),
    });
    const model = res.opportunities.find((o) => o.title === "Chicken Prep Plan");
    assert.ok(model);
    assert.deepEqual(model.evidence.map((e) => e.sourceId), ["src-m0"]); // the chicken signal, not all six
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

  await t.test("phrases of one market merge into one candidate that cites each (issue #85)", () => {
    const two = buildIdeas("pc troubleshooting", [phrase("why does my gpu crash", 3), phrase("gpu driver crash fix", 4)]).ideas;
    const twoRefs = new Map(two.flatMap((i) => i.evidence).map((e) => [e.source_id, { sourceUuid: "src-web", excerpt: e.title }]));
    const gpu = marketFor("why does my gpu crash", markets, "pc troubleshooting");
    assert.equal(marketFor("gpu driver crash fix", markets, "pc troubleshooting")?.id, gpu?.id);
    const cands = ideaCandidates("pc troubleshooting", two, markets, twoRefs).filter((c) => c.marketId === gpu?.id);
    assert.equal(cands.length, 1);
    assert.equal(cands[0].evidence.length, 2);
  });

  await t.test("a phrase-only candidate is capped one below the lowest evidenced score (issue #85)", () => {
    const [idea] = ideaCandidates("pc troubleshooting", ideas, markets, refs);
    const evidenced = { ...idea, id: "e", opportunityScore: 12, evidence: [{ ...idea.evidence[0], claim: "Reddit post" }] };
    assert.equal(capIdeaOnlyScores([{ ...idea, opportunityScore: 70 }, evidenced])[0].opportunityScore, 11);
    assert.equal(capIdeaOnlyScores([{ ...idea, opportunityScore: 70 }])[0].opportunityScore, 70);
    // issue #100: its confidence is capped at the lowest evidenced confidence too
    const capped = capIdeaOnlyScores([{ ...idea, confidence: 1 }, { ...evidenced, confidence: 0.2 }, { ...evidenced, id: "f", confidence: 0.8 }]);
    assert.equal(capped[0].confidence, 0.2);
    // a well-covered run (evidenced at 1) still holds the phrase-only row below 100%, rows included
    const full = capIdeaOnlyScores([{ ...idea, confidence: 1, evidence: idea.evidence.map((e) => ({ ...e, confidence: 1 })) }, { ...evidenced, confidence: 1 }])[0];
    assert.equal(full.confidence, 0.35);
    assert.ok(full.evidence.every((e) => e.confidence === 0.35));
    assert.equal(capIdeaOnlyScores([{ ...idea, confidence: 1 }])[0].confidence, 0.35);
    assert.deepEqual(capped.slice(1).map((c) => c.confidence), [0.2, 0.8]);
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

// Part 6.16, from the 2026-11-15 live run on "meal prep": ten general ideas were filed under a
// one-signal market, because jaccard divides by all of a market's text.
test("a quick idea goes to the market holding its own words, not to the one with the least text", () => {
  const market = (id: string, name: string, demandScore: number, problems: string[]): OpportunityMarketInput => ({
    id,
    name,
    demandScore,
    confidence: 0.5,
    signals: problems.map((problem, i) => ({
      id: `${id}-${i}`,
      source_id: "src",
      source_type: "gtrends",
      title: problem,
      content: problem,
      url: null,
      analysis: { audience: "people searching", problem },
    })),
  });
  const markets = [
    market("small", "Vegetarian meal prep", 38, ["They look for vegetarian meal prep ideas."]),
    market("big", "Meal prep recipes", 69, ["They look for recipes to meal prep.", "They want freezable soups and big-batch family meals.", "They look for ways to meal prep chicken."]),
    market("healthy", "Healthy meal prep plans", 26, ["They look for meal prep that is good for them."]),
    market("budget", "Budget meal prep", 33, ["They want 10 healthy meals in one hour on a budget."]),
  ];
  // Only seed words, or words found in no market: it belongs to none (issue #42).
  assert.equal(marketFor("how to meal prep", markets, "meal prep"), null);
  assert.equal(marketFor("can meal prep last 5 days", markets, "meal prep"), null);
  // Its own word is in one market's text.
  assert.equal(marketFor("meal prep chicken recipes", markets, "meal prep")?.id, "big");
  assert.equal(marketFor("vegetarian meal prep", markets, "meal prep")?.id, "small");
  // A word in a market's name beats the same word in another market's snippet.
  assert.equal(marketFor("is meal prep healthy", markets, "meal prep")?.id, "healthy");
});

test("mergeSharedProblems folds one audience and problem across markets and formats (issue #70)", async () => {
  const { mergeSharedProblems } = await import("./generator.ts");
  const { isIdeaOnly } = await import("./from-ideas.ts");
  const base = {
    solution: "s", priceRange: null, sophistication: null, mechanism: null, outcome: null, urgency: null,
    confidence: 0.5, evidence: [], matchingSignals: 1, marketSignals: null,
  };
  const a = { ...base, id: "a", marketId: "m1", title: "a", targetAudience: "People with computer problems", problem: "PDF for people with computer problems that will not boot", format: null, opportunityScore: 60 };
  const b = { ...a, id: "b", marketId: "m2", problem: "Guide for people with computer problems that will not boot", format: "guide" as const, opportunityScore: 55 };
  const c = { ...a, id: "c", marketId: "m2", targetAudience: "Gamers", problem: "Slow frame rate on old laptops", opportunityScore: 40 };
  const { kept, merged } = mergeSharedProblems([a, b, c]);
  assert.equal(merged, 1);
  assert.deepEqual(kept.map((k) => k.id), ["a", "c"]);
  assert.equal(kept[0].format, "guide");
  // Two audiences with the same problem text stay two opportunities (only idea-only candidates merge on text).
  const d = { ...a, id: "d", marketId: "m3", targetAudience: "Students", problem: a.problem, opportunityScore: 50 };
  assert.deepEqual(mergeSharedProblems([a, d]).kept.map((k) => k.id), ["a", "d"]);
  assert.equal(isIdeaOnly([`${IDEA_CLAIM_PREFIX} "x"`]), true);
  assert.equal(isIdeaOnly([`${IDEA_CLAIM_PREFIX} "x"`, "Reddit post"]), false);
  assert.equal(isIdeaOnly([`[type: frequency | conf: 0.80] ${IDEA_CLAIM_PREFIX} "x"`]), true);
  assert.equal(isIdeaOnly([]), false);
});

test("a signal whose analysed problem says none is described yields no opportunity (issue #88)", async () => {
  assert.equal(isUndescribedProblem("No specific PC fault is described; the text only advertises guidance."), true);
  assert.equal(isUndescribedProblem("No PC problem is evidenced; the text is a rig-building subreddit."), true);
  assert.equal(isUndescribedProblem("Users need to restart and update drivers."), false);
  assert.equal(isUndescribedProblem("No one can find the boot menu key on new laptops."), false);
  assert.equal(isUndescribedProblem("No clear guide exists for flashing the BIOS on B550 boards."), false);
  assert.equal(isUndescribedProblem("No specific error code appears, but the laptop shuts down under load."), false);
  assert.equal(isUndescribedProblem("No one can fix the driver issue that is mentioned in every thread."), false);
  assert.equal(isUndescribedProblem("No issues are mentioned with the GPU, but the CPU overheats under load."), false);
  assert.equal(isUndescribedProblem("No error message is given when the Windows update fails."), false);
  // Issue #94: the other ways extraction says "no problem named".
  assert.equal(isUndescribedProblem("Looks for simple fixes for common PC issues; no specific fault is named."), true);
  assert.equal(isUndescribedProblem("Asks how to fix their PC's issues without saying what the issue is."), true);
  assert.equal(isUndescribedProblem("The post does not name a specific problem."), true);
  assert.equal(isUndescribedProblem("Wants help without naming any problem."), true);
  assert.equal(isUndescribedProblem("The post doesn\u2019t name a specific problem."), true);
  assert.equal(isUndescribedProblem("Laptop is slow without saying what the fan noise means, no fault is named but it overheats."), false);
  assert.equal(isUndescribedProblem("Computer will not turn on or boot after a power cut."), false);
  assert.equal(isUndescribedProblem("The printer jams on every page; no other issue is mentioned."), false);
  assert.equal(isUndescribedProblem("GPU fans spin at full speed after the driver update; no further problems are described."), false);
  assert.equal(isUndescribedProblem("Asks for help with a blue screen on boot without describing the issue in detail."), false);
  assert.equal(isUndescribedProblem("Laptop overheats while gaming; user posts without specifying the fault code."), false);
  assert.equal(isUndescribedProblem("Fan grinds loudly at idle and the manual does not describe the problem."), false);
  assert.equal(isUndescribedProblem("Wrist strain while typing, without mentioning a painful posture."), false);
  assert.equal(isUndescribedProblem("Screen flickers after the Windows update, without specifying a fault."), false);
  assert.equal(isUndescribedProblem("Wi-Fi drops every hour without naming any specific problem."), false);
  assert.equal(isUndescribedProblem("Battery drains overnight without stating a clear issue."), false);
  assert.equal(isUndescribedProblem("Asks how to fix their PC without saying what the issues are."), true);
  assert.equal(isUndescribedProblem("Asks how to fix a printer that jams every page without naming a problem."), false);
  assert.equal(isUndescribedProblem("Asks how to fix their PC\u2019s issues without saying what the issue is."), true);

  const mk = (id: string, problem: string, embedding: number[]) => ({
    id, source_id: `s${id}`, source_type: "reddit", title: id, content: id, url: `https://x/${id}`, published_at: "2026-10-20T12:00:00Z",
    analysis: { audience: "Desktop PC users", problem, intent: "strong", urgency: null, pdf_relevance: 0.8 },
    embedding,
  });
  const empty = mk("b", "No specific PC fault is described; the text only advertises basic troubleshooting guidance for common desktop problems.", [0.99, 0.1, 0]);
  const real = mk("a", "The PC will not boot after an update.", [1, 0, 0]);
  const market = { id: "m1", name: "PC", demandScore: 50, confidence: 0.5, signals: [real, empty] };

  // Pool path: only the described signal makes an opportunity, and the other is not cited.
  const viaPool = await generate25Opportunities([market]);
  assert.deepEqual(viaPool.opportunities.map((o) => o.problem), ["The PC will not boot after an update."]);
  assert.deepEqual(viaPool.opportunities[0].evidenceSignalIds, ["a"]);

  // Model path: wording that overlaps the no-problem signal (not the real one) must not make it `own`.
  const router = {
    generateObject: async (o: { validate: (r: unknown) => unknown }) => ({
      object: o.validate([{
        marketId: "m1", title: "Basic guide", targetAudience: "Desktop PC users",
        problem: "Desktop PC users lack basic troubleshooting guidance for common desktop problems",
        solution: "A guide", format: "guide",
      }]),
    }),
  } as unknown as AIRouter;
  const viaModel = await generate25Opportunities([market], { router });
  assert.equal(viaModel.opportunities.some((o) => o.evidenceSignalIds?.includes("b")), false);
  assert.equal(viaModel.opportunities.some((o) => o.title === "Basic guide"), false);
});


test("generic-advice signals name no concrete problem and never outrank concrete ones (issue #94)", async () => {
  // Real analysed problems of gate run 6c798623 (`pc troubleshooting`).
  const generic = [
    "The user needs guidance on troubleshooting common computer problems, starting with restarting the device and noting error messages.",
    "Desktop PC users need repair instructions, manuals, schematics, and DIY troubleshooting resources.",
    "No specific PC fault is described; the text only advertises basic troubleshooting guidance for common desktop problems.",
    "Looks for simple fixes for common PC issues; no specific fault is named.",
    "Asks how to fix their PC's issues without saying what the issue is.",
    "The text introduces a step-by-step guide covering typical hardware and operating system problems encountered by technicians.",
    "Wants solutions to the top 30 desktop PC problems; no single fault is named.",
  ];
  const concrete = [
    "The user's computer will not turn on or boot, requiring step-by-step diagnostics.",
    "The user needs instructions on performing Windows repair, Reset, Refresh, or reinstalling the Windows OS for common troubleshooting.",
    "Laptop overheats and shuts down under load.",
    "Windows update fails with error 0x80070005.",
    "Seeks a checklist for onboarding new hires.",
    "No specific error code appears, but the laptop shuts down under load.",
    "Computer restarts.",
    "Error message on start.",
    "Laptop overheats and shuts down under load; no other problem is mentioned.",
    "Wants to fix BSOD 0x0000007E without saying which driver.",
  ];
  for (const p of generic) assert.equal(isUndescribedProblem(p), true, p);
  for (const p of concrete) assert.equal(isUndescribedProblem(p), false, p);

  const sig = (id: string, problem: string) => ({
    id, source_id: `s${id}`, source_type: "reddit", title: id, content: id, url: `https://x/${id}`, published_at: "2026-10-20T12:00:00Z",
    analysis: { audience: "PC users", problem, intent: "strong", urgency: null, pdf_relevance: 0.8 },
    embedding: null,
  });
  // The generic signals share the big market (higher demand), as in the gate run.
  const big = { id: "m1", name: "Basic PC troubleshooting steps", demandScore: 80, confidence: 0.9, signals: generic.map((p, i) => sig(`g${i}`, p)) };
  const small = { id: "m2", name: "PC won't power on", demandScore: 30, confidence: 0.5, signals: [sig("c0", concrete[0])] };
  const res = await generate25Opportunities([big, small]);
  assert.deepEqual(res.opportunities.map((o) => o.problem), [concrete[0]]);
});
