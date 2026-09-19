// lib/cluster/cluster.test.ts — Unit tests for vector math, clustering & PRD §15 shape.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, computeCentroid } from "./similarity.ts";
import { clusterSignals } from "./clusterer.ts";
import type { ClusterSignal } from "./types.ts";

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
    assert.ok(c1.relatedProducts.length > 0);
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
