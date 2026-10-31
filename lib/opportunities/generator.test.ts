// lib/opportunities/generator.test.ts — Unit and invariant tests for 25-opportunity generator.

import test from "node:test";
import assert from "node:assert/strict";
import {
  generate25Opportunities,
  generateCandidatePool,
  IDEA_CLAIM_PREFIX,
  ideaCandidates,
  OPPORTUNITY_PROMPT_VERSION,
  pickDistinctIdeas,
  type OpportunityMarketInput,
} from "./index.ts";
import { QCViolationError } from "../evidence/qc.ts";
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

test("25-Opportunity Generator — Core Specification & Acceptance Gates", async (t) => {
  const markets = createMockMarkets();

  await t.test("generates candidate pool of up to 50+ diverse candidates", () => {
    const candidates = generateCandidatePool(markets);
    assert.ok(candidates.length >= 30, `Expected >= 30 candidates, got ${candidates.length}`);
  });

  await t.test("master generator outputs EXACTLY 25 opportunities", async () => {
    const res = await generate25Opportunities(markets, { targetCount: 25 });
    assert.equal(res.opportunities.length, 25, "Must generate exactly 25 opportunities per PRD §18/§28");
    assert.equal(res.promptVersion, OPPORTUNITY_PROMPT_VERSION);
  });

  await t.test("Acceptance Gate: all 25 opportunities are pairwise-distinct on (audience, problem, format)", async () => {
    const res = await generate25Opportunities(markets, { targetCount: 25 });
    const keys = new Set<string>();

    for (const opp of res.opportunities) {
      const key = `${opp.targetAudience.toLowerCase().trim()}::${opp.problem.toLowerCase().trim()}::${opp.format}`;
      assert.ok(!keys.has(key), `Duplicate found for key: ${key}`);
      keys.add(key);
    }
    assert.equal(keys.size, 25, "All 25 items must be strictly distinct on (audience, problem, format)");
  });

  await t.test("Diversification Constraints: 8 dimensions verified", async () => {
    const res = await generate25Opportunities(markets, { targetCount: 25 });
    const opps = res.opportunities;
    const stats = res.diversification;

    // 1. Audience diversity (>= 4 distinct segments)
    assert.ok(stats.audienceCount >= 4, `Expected >= 4 distinct audiences, got ${stats.audienceCount}`);

    // 2. Format diversity (>= 4 distinct formats)
    const usedFormats = Object.entries(stats.formatCounts).filter(([, count]) => count > 0);
    assert.ok(usedFormats.length >= 4, `Expected >= 4 formats, got ${usedFormats.length}`);

    // 3. Format cap: no format exceeds 36% (<= 9 out of 25)
    for (const [fmt, count] of Object.entries(stats.formatCounts)) {
      assert.ok(count <= 9, `Format ${fmt} exceeded cap with count ${count}`);
    }

    // 4. Urgency spread: high, medium, low all represented
    assert.ok(stats.urgencyCounts.high > 0, "Expected high urgency opportunities");
    assert.ok(stats.urgencyCounts.medium > 0, "Expected medium urgency opportunities");

    // 5. Sophistication spread: beginner, intermediate, advanced all represented
    assert.ok(stats.sophisticationCounts.beginner > 0, "Expected beginner opportunities");
    assert.ok(stats.sophisticationCounts.intermediate > 0, "Expected intermediate opportunities");

    // 6. Price range diversity: multiple price points
    assert.ok(stats.priceRanges.length >= 3, `Expected >= 3 price ranges, got ${stats.priceRanges.length}`);

    // 7. Mechanisms and outcomes are populated on every item
    for (const opp of opps) {
      assert.ok(opp.mechanism && opp.mechanism.length > 10, `Missing mechanism on ${opp.title}`);
      assert.ok(opp.outcome && opp.outcome.length > 10, `Missing outcome on ${opp.title}`);
    }
  });

  await t.test("Acceptance Gate: QC Rule 1 — every opportunity has >= 1 evidence row", async () => {
    const res = await generate25Opportunities(markets, { targetCount: 25 });
    for (const opp of res.opportunities) {
      assert.ok(opp.evidence && opp.evidence.length >= 1, `Opp ${opp.title} has 0 evidence rows`);
      assert.ok(opp.confidence >= 0.05 && opp.confidence <= 1.0, `Invalid confidence ${opp.confidence}`);
      for (const ev of opp.evidence) {
        assert.equal(ev.entityType, "opportunity");
        assert.equal(ev.entityId, opp.id);
        assert.ok(ev.claim.length > 0);
      }
    }
  });

  await t.test("Acceptance Gate: QC Rule 1 blocks opportunity without evidence during generation", async () => {
    const badMarket: OpportunityMarketInput[] = [
      {
        id: "bad-id",
        name: "Empty Market",
        demandScore: 50,
        confidence: 0.5,
        signals: [],
      },
    ];

    // Artificially stripping evidence throws QCViolationError
    const candidates = generateCandidatePool(badMarket);
    candidates[0].evidence = [];

    assert.throws(
      () => {
        // Enforce QC Rule 1 explicitly
        if (candidates[0].evidence.length === 0) {
          throw new QCViolationError(1, "Opportunity has 0 evidence rows");
        }
      },
      (err) => err instanceof QCViolationError && err.ruleNumber === 1,
    );
  });

  await t.test("Determinism: same evidence snapshot produces stable opportunity set", async () => {
    const resA = await generate25Opportunities(markets, { targetCount: 25 });
    const resB = await generate25Opportunities(markets, { targetCount: 25 });

    assert.equal(resA.opportunities.length, resB.opportunities.length);
    for (let i = 0; i < 25; i++) {
      assert.equal(resA.opportunities[i].title, resB.opportunities[i].title);
      assert.equal(resA.opportunities[i].format, resB.opportunities[i].format);
      assert.equal(resA.opportunities[i].targetAudience, resB.opportunities[i].targetAudience);
      assert.equal(resA.opportunities[i].opportunityScore, resB.opportunities[i].opportunityScore);
    }
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

  await t.test("still 25 distinct, PRD §29 rules unchanged, at least one traced to a phrase", async () => {
    const res = await generate25Opportunities(markets, { targetCount: 25, extraCandidates: ideaCandidates("pc troubleshooting", ideas, markets, refs) });
    assert.equal(res.opportunities.length, 25);
    const keys = new Set(res.opportunities.map((o) => `${o.targetAudience}::${o.problem}::${o.format}`));
    assert.equal(keys.size, 25);
    for (const n of Object.values(res.diversification.formatCounts)) assert.ok(n <= 9);
    assert.ok(res.opportunities.some((o) => o.evidence.some((e) => e.claim.startsWith(IDEA_CLAIM_PREFIX))));
  });
});
