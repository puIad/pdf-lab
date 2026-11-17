// lib/cluster/cluster.test.ts — Unit tests for vector math, clustering & PRD §15 shape.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, computeCentroid } from "./similarity.ts";
import { clusterSignals } from "./clusterer.ts";
import { problemPhraseName, summarizeCluster } from "./summarizer.ts";
import type { ClusterSignal } from "./types.ts";
import type { AIRouter } from "../ai/router.ts";

describe("similarity & vector math", () => {
  it("computes cosine similarity accurately", () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];
    const v4 = [-1, 0, 0];

    assert.equal(Math.round(cosineSimilarity(v1, v2) * 100) / 100, 1.0);
    assert.equal(Math.round(cosineSimilarity(v1, v3) * 100) / 100, 0.0);
    assert.equal(Math.round(cosineSimilarity(v1, v4) * 100) / 100, -1.0);
  });

  it("computes normalized centroid", () => {
    const vectors = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const centroid = computeCentroid(vectors);
    assert.equal(centroid.length, 3);
    // Norm of centroid must be 1.0
    const norm = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
    assert.equal(Math.round(norm * 100) / 100, 1.0);
  });
});

describe("clusterSignals (PRD §15)", () => {
  it("groups similar signals and separates dissimilar ones into clusters", async () => {
    // Vector family 1: Boot/power issue signals (close to [1, 0.1, 0.05])
    const bootSignals: ClusterSignal[] = [
      {
        id: "sig-1",
        sourceType: "reddit",
        title: "PC won't boot after building",
        content: "Turned on PSU switch, fans spin but no boot",
        url: "https://reddit.com/r/buildapc/1",
        analysis: {
          audience: "first-time PC builders",
          problem: "PC fails to boot after power on",
          intent: "strong",
          urgency: "high",
          pdf_relevance: 0.85,
        },
        embedding: [0.99, 0.1, 0.05],
      },
      {
        id: "sig-2",
        sourceType: "reddit",
        title: "Random desktop shutdown troubleshooting",
        content: "PC shut off instantly, loose cable",
        url: "https://reddit.com/r/buildapc/2",
        analysis: {
          audience: "PC builders",
          problem: "Loose PSU power cable causes shutdown",
          intent: "medium",
          urgency: "medium",
          pdf_relevance: 0.7,
        },
        embedding: [0.95, 0.15, 0.08],
      },
    ];

    // Vector family 2: Wi-Fi/network issue signals (close to [0.05, 0.99, 0.1])
    const wifiSignals: ClusterSignal[] = [
      {
        id: "sig-3",
        sourceType: "web",
        title: "Wi-Fi extremely slow on new motherboard",
        content: "Antenna was not connected properly",
        url: "https://example.com/wifi",
        analysis: {
          audience: "prebuilt PC owners",
          problem: "Slow Wi-Fi speed and motherboard antenna issue",
          intent: "medium",
          urgency: "medium",
          pdf_relevance: 0.65,
        },
        embedding: [0.05, 0.99, 0.1],
      },
      {
        id: "sig-4",
        sourceType: "gtrends",
        title: "pc wifi connection troubleshooting",
        content: "Search trends for wifi dropouts",
        url: "https://trends.google.com/q=wifi",
        analysis: {
          audience: "PC users",
          problem: "Frequent Wi-Fi disconnects",
          intent: "strong",
          urgency: "medium",
          pdf_relevance: 0.8,
        },
        embedding: [0.08, 0.96, 0.12],
      },
    ];

    const clusters = await clusterSignals([...bootSignals, ...wifiSignals], {
      similarityThreshold: 0.75,
    });

    assert.equal(clusters.length, 2, "should form exactly 2 clusters");

    // First cluster check
    const c1 = clusters[0];
    assert.ok(c1.id.startsWith("cluster-"));
    assert.ok(c1.name.length > 0);
    assert.equal(c1.frequency, 2);
    assert.ok(c1.growth >= 1.0);
    assert.ok(c1.language.length > 0);
    assert.deepEqual(c1.relatedProducts, []); // no model, no product titles
    assert.ok(c1.scoring.score > 0);
    assert.ok(c1.scoring.confidence > 0);
    assert.equal(c1.signals.length, 2);

    // Verify boot signals are in one cluster and wifi in the other
    const bootCluster = clusters.find((c) => c.signals.some((s) => s.id === "sig-1"));
    const wifiCluster = clusters.find((c) => c.signals.some((s) => s.id === "sig-3"));
    assert.ok(bootCluster);
    assert.ok(wifiCluster);
    assert.notEqual(bootCluster.id, wifiCluster.id);
    assert.ok(bootCluster.signals.every((s) => s.id === "sig-1" || s.id === "sig-2"));
    assert.ok(wifiCluster.signals.every((s) => s.id === "sig-3" || s.id === "sig-4"));
  });
});

describe("summarizeCluster without a model (Part 6.4)", () => {
  // SAMPLE DATA (fixture rule): budgeting signals.
  const sig = (id: string, title: string, audience: string | null, problem: string | null): ClusterSignal => ({
    id,
    sourceType: "reddit",
    title,
    content: title,
    url: `https://reddit.com/${id}`,
    analysis: { audience, problem, intent: "strong", urgency: null, pdf_relevance: 0.8 },
    embedding: [1, 0, 0],
  });

  it("names a cluster from its most typical problem phrase, with no PC defaults", async () => {
    const c = await summarizeCluster("cluster-1", [
      sig("a", "Groceries wreck our plan", "young couples", "Grocery spending exceeds the monthly budget"),
      sig("b", "Overspending again", "young couples", "Monthly grocery budget runs out early"),
      sig("c", "Budget help", "students", "Cannot keep a grocery budget"),
    ], [1, 0, 0]);
    assert.equal(c.name, "Grocery spending exceeds the monthly budget"); // all equally central: the first
    assert.equal(c.audience, "young couples");
    assert.deepEqual(c.relatedProducts, []);
    assert.doesNotMatch(JSON.stringify({ ...c, signals: [] }), /\b(pc|bios|gamers?|repair shop|hardware|boot|troubleshooting)\b/i);
  });

  it("unknown audience is null and an empty cluster is unnamed, not invented", async () => {
    const c = await summarizeCluster("cluster-2", [sig("d", "", null, null)], [1, 0, 0]);
    assert.equal(c.audience, null);
    assert.equal(c.name, "Unnamed cluster");
  });
});


describe("cluster trend comes from observed Trends rows (Part 6.11)", () => {
  const row = (id: string, sourceType: string, engagement: Record<string, unknown> | null): ClusterSignal => ({
    id,
    sourceType,
    title: `budget ${id}`,
    content: null,
    url: null,
    publishedAt: null,
    analysis: { audience: "households", problem: "cannot stick to a budget", intent: "strong", urgency: "medium", pdf_relevance: 0.7 },
    embedding: [1, 0],
    engagement,
  });
  const trendOf = async (signals: ClusterSignal[]) => (await summarizeCluster("c1", signals, [1, 0])).trend;

  it("no Trends row is unknown, not stable", async () => {
    assert.equal(await trendOf([row("a", "reddit", { upvotes: 10 }), row("b", "web", { position: 1 })]), "unknown");
  });

  it("a Trends row without a direction is stable; it no longer means accelerating", async () => {
    assert.equal(await trendOf([row("a", "reddit", null), row("g", "gtrends", { interest_value: 40, rising: false })]), "stable");
  });

  it("a rising related query or a rising interest summary is accelerating; falling is declining", async () => {
    assert.equal(await trendOf([row("g", "gtrends", { interest_value: 300, rising: true })]), "accelerating");
    assert.equal(await trendOf([row("g", "gtrends", { avg_interest: 50, direction: "rising" })]), "accelerating");
    assert.equal(await trendOf([row("g", "gtrends", { avg_interest: 50, direction: "falling" })]), "declining");
  });
});

describe("cluster naming has a budget (#58)", () => {
  // SAMPLE DATA (fixture rule): three unrelated budgeting signals, so three singleton clusters.
  const sig = (id: string, embedding: number[], problem: string): ClusterSignal => ({
    id,
    sourceType: "reddit",
    title: problem,
    content: problem,
    url: null,
    analysis: { audience: "households", problem, intent: "strong", urgency: null, pdf_relevance: 0.7 },
    embedding,
  });
  const signals = [
    sig("a", [1, 0, 0], "Rent takes the whole budget"),
    sig("b", [0, 1, 0], "Groceries overrun every month"),
    sig("c", [0, 0, 1], "Debt payments crowd out savings"),
  ];
  const fakeRouter = (answer: () => Promise<unknown>) => {
    let calls = 0;
    const router = {
      generateObject: async (input: { validate: (raw: unknown) => unknown }) => {
        calls++;
        return { object: input.validate(await answer()) };
      },
    } as unknown as AIRouter;
    return { router, calls: () => calls };
  };

  it("one failed naming call stops naming; the rest keep names from observed terms", async () => {
    const f = fakeRouter(async () => {
      throw new Error("all AI providers failed for tier 'cheap'");
    });
    const clusters = await clusterSignals(signals, { router: f.router });
    assert.equal(clusters.length, 3);
    assert.equal(f.calls(), 1);
    assert.ok(clusters.every((c) => c.name && c.name !== "Unnamed cluster"));
  });

  it("no naming call starts after the budget is spent", async () => {
    let t = 0;
    const f = fakeRouter(async () => {
      t += 70_000; // each answer takes 70 s
      return { name: "Model Name", products: ["Checklist"] };
    });
    const clusters = await clusterSignals(signals, { router: f.router, nowFn: () => t, namingBudgetMs: 120_000 });
    assert.equal(f.calls(), 2); // starts at 0 s and 70 s; at 140 s the budget is spent
    assert.deepEqual(clusters.map((c) => c.name === "Model Name"), [true, true, false]);
  });
});

describe("a naming call that outlives the budget is abandoned (#58 review)", () => {
  it("clustering returns by the budget even when the model never answers", async () => {
    const hang = { generateObject: () => new Promise(() => {}) } as unknown as AIRouter;
    const sig = (id: string, embedding: number[]): ClusterSignal => ({
      id,
      sourceType: "reddit",
      title: "Rent takes the whole budget",
      content: null,
      url: null,
      analysis: { audience: "households", problem: "Rent takes the whole budget", intent: "strong", urgency: null, pdf_relevance: 0.7 },
      embedding,
    });
    const t0 = Date.now();
    const clusters = await clusterSignals([sig("a", [1, 0]), sig("b", [0, 1])], { router: hang, namingBudgetMs: 50 });
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(clusters.length, 2);
    assert.ok(clusters.every((c) => c.name && c.name !== "Unnamed cluster"));
  });
});

describe("fallback names read as names (#59)", () => {
  // Problem texts stored by budgeting run 03b27c65 (2026-11-17), whose names were word lists.
  const cases: Array<[string, string | null]> = [
    ["They need the steps to make a budget: work out after-tax income, choose a system, track progress and automate savings.", "Steps to make a budget"],
    ["They avoid budgeting because of myths, and miss out on preventing debt and building emergency savings.", "Avoid budgeting because of myths"],
    ["They need a plan to pay essential bills, manage spending and save for future needs.", "Plan to pay essential bills"],
    ["They need to learn how to create a first budget, set goals, know net income, track spending, and set realistic spending limits.", "Learn how to create a first budget"],
    ["They do not understand how and where they are spending their money.", "Do not understand how and where they are spending their money"],
    ["They risk spending more than they earn and taking on debt without a budget.", "Risk spending more than they earn and taking on debt…"],
    ["They do not know which type of budget fits them or how to use each one.", "Do not know which type of budget fits them…"],
    ["They are searching for software to manage a budget.", "Searching for software to manage a budget"],
    ["They were not given a clear plan to pay off credit card debt", "Not given a clear plan to pay off credit card debt"],
    ["Their employer has not provided a guide to the 401k match", "Their employer has not provided a guide to the 401k match"],
    ["They need to max out a 401(k) before year end", "Max out a 401(k) before year end"],
    ["They overspend by $1.5k every month on takeout", "Overspend by $1.5k every month on takeout"],
    ["Not specified", null],
    ["none explicitly stated in the text", null],
    ["N/A", null],
    ["", null],
  ];
  for (const [problem, name] of cases) {
    it(`${JSON.stringify(problem.slice(0, 40))} -> ${name}`, () => assert.equal(problemPhraseName(problem), name));
  }

  it("a problem that only mentions what was given is not a placeholder", () => {
    assert.equal(problemPhraseName("They cannot track the notes they were given"), "Cannot track the notes they were given");
  });

  it("the most central signal names the cluster; a placeholder problem is passed over", async () => {
    const sig = (id: string, embedding: number[], problem: string): ClusterSignal => ({
      id, sourceType: "reddit", title: "Budget thread", content: null, url: null,
      analysis: { audience: null, problem, intent: "strong", urgency: null, pdf_relevance: 0.6 }, embedding,
    });
    const c = await summarizeCluster("c", [
      sig("a", [0.6, 0.8], "They forget irregular bills"),
      sig("b", [1, 0], "none explicitly stated in the text"),
      sig("c", [0.9, 0.1], "They overspend on groceries every month"),
    ], [1, 0]);
    assert.equal(c.name, "Overspend on groceries every month");
    const lone = await summarizeCluster("d", [sig("e", [1, 0], "none explicitly stated in the text")], [1, 0]);
    assert.equal(lone.name, "Unnamed cluster");
  });

  it("a model that copies the prompt's example name is not used", async () => {
    const router = {
      generateObject: async (input: { validate: (raw: unknown) => unknown }) => ({
        object: input.validate({ name: "Specific Problem Family Name", products: ["Checklist"] }),
      }),
    } as unknown as AIRouter;
    const c = await summarizeCluster("c", [{
      id: "a", sourceType: "reddit", title: "t", content: null, url: null,
      analysis: { audience: null, problem: "They overspend on groceries", intent: "strong", urgency: null, pdf_relevance: 0.6 },
      embedding: [1, 0],
    }], [1, 0], { router });
    assert.equal(c.name, "Overspend on groceries");
  });
});
