// lib/cluster/summarizer.ts — Synthesizes PRD §15 problem cluster attributes.
// Shape: name, frequency, growth, audience, urgency, language, related products.
// Uses AIRouter cheap tier when available with deterministic rule fallback for tests.

import type { AIRouter } from "../ai/router.ts";
import type { ClusterSignal, ProblemCluster } from "./types.ts";
import { scoreMarket } from "../scoring/scoring.ts";
import type { TrendDirection } from "../scoring/types.ts";

export interface SummarizeClusterOptions {
  router?: AIRouter;
  tier?: "cheap";
}

const URGENCY_PRIORITY: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function determineUrgency(signals: ClusterSignal[]): "low" | "medium" | "high" {
  let maxScore = 1;
  for (const s of signals) {
    const u = (s.analysis?.urgency || "low").toLowerCase();
    const score = URGENCY_PRIORITY[u] ?? 1;
    if (score > maxScore) maxScore = score;
  }
  if (maxScore === 3) return "high";
  if (maxScore === 2) return "medium";
  return "low";
}

function determineAudience(signals: ClusterSignal[]): string {
  const counts = new Map<string, number>();
  for (const s of signals) {
    const a = (s.analysis?.audience || "").trim();
    if (a) counts.set(a, (counts.get(a) || 0) + 1);
  }
  if (counts.size === 0) return "PC users & builders";
  let best = "";
  let bestCount = -1;
  for (const [aud, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = aud;
    }
  }
  return best;
}

function extractLanguagePhrases(signals: ClusterSignal[]): string[] {
  const phrases = new Set<string>();
  for (const s of signals) {
    if (s.title) {
      const cleanTitle = s.title.replace(/[^\w\s-]/g, "").trim();
      if (cleanTitle.length > 5 && cleanTitle.length < 100) {
        phrases.add(`"${cleanTitle}"`);
      }
    }
    if (s.analysis?.problem) {
      const p = s.analysis.problem.trim();
      if (p.length > 10 && p.length < 120) {
        phrases.add(p);
      }
    }
  }
  return [...phrases].slice(0, 6);
}

function generateDefaultClusterName(signals: ClusterSignal[]): string {
  const combined = signals.map((s) => `${s.title || ""} ${s.analysis?.problem || ""}`).join(" ").toLowerCase();

  if (combined.includes("boot") || combined.includes("shut") || combined.includes("power") || combined.includes("turn on")) {
    return "Boot & Power Delivery Failures";
  }
  if (combined.includes("display") || combined.includes("screen") || combined.includes("gpu") || combined.includes("monitor") || combined.includes("black")) {
    return "Display & GPU Diagnostic Issues";
  }
  if (combined.includes("wifi") || combined.includes("network") || combined.includes("ethernet") || combined.includes("internet")) {
    return "Wi-Fi & Network Adapter Troubleshooting";
  }
  if (combined.includes("bsod") || combined.includes("blue screen") || combined.includes("crash") || combined.includes("freeze")) {
    return "BSOD & System Stability Crashes";
  }
  if (combined.includes("overheat") || combined.includes("fan") || combined.includes("temp") || combined.includes("thermal")) {
    return "Thermal Management & Overheating";
  }
  if (combined.includes("driver") || combined.includes("update") || combined.includes("bios") || combined.includes("firmware")) {
    return "Driver & BIOS Configuration";
  }
  if (combined.includes("game") || combined.includes("fps") || combined.includes("performance") || combined.includes("slow")) {
    return "Gaming & System Performance Optimization";
  }

  const primaryAudience = signals[0]?.analysis?.audience || "System";
  return `${primaryAudience} Troubleshooting`;
}

function generateRelatedProducts(clusterName: string): string[] {
  const nameLower = clusterName.toLowerCase();
  if (nameLower.includes("boot") || nameLower.includes("power")) {
    return [
      "The First-Time Builder's No-Boot Diagnostic Flowchart",
      "PC Power & Wiring 10-Minute Verification Checklist",
      "Standing Desk & Cable Management Strain-Relief Guide",
    ];
  }
  if (nameLower.includes("display") || nameLower.includes("gpu")) {
    return [
      "No-Display Troubleshooting Decision Tree (GPU vs Motherboard)",
      "Post-Impact PC Hardware Physical Reseating Guide",
      "Monitor & DisplayPort Connection Handshake Checklist",
    ];
  }
  if (nameLower.includes("wifi") || nameLower.includes("network")) {
    return [
      "Prebuilt PC Wi-Fi & Antenna Signal Optimization Checklist",
      "Motherboard Debug LED Error Code Reference Card",
      "Windows Network Stack Clean Reinstall Guide",
    ];
  }
  if (nameLower.includes("bsod") || nameLower.includes("crash")) {
    return [
      "Windows BSOD Stop-Code Identification & Repair Matrix",
      "Memory & Driver Crash Diagnostic Checklist",
      "Safe-Mode System File Verification Guide",
    ];
  }
  return [
    `${clusterName} Diagnostic Checklist`,
    `Step-by-Step ${clusterName} Resolution Guide`,
    `${clusterName} Quick Reference Cheat Sheet`,
  ];
}

export async function summarizeCluster(
  id: string,
  signals: ClusterSignal[],
  centroid: number[],
  opts: SummarizeClusterOptions = {},
): Promise<ProblemCluster> {
  const audience = determineAudience(signals);
  const urgency = determineUrgency(signals);
  const language = extractLanguagePhrases(signals);
  const defaultName = generateDefaultClusterName(signals);
  let name = defaultName;
  let relatedProducts = generateRelatedProducts(name);

  // If AIRouter is provided and cheap tier is configured, synthesize via router
  if (opts.router) {
    try {
      const signalSnippets = signals
        .slice(0, 8)
        .map((s, i) => `${i + 1}. [${s.sourceType}] ${s.title || ""} — Problem: ${s.analysis?.problem || ""}`)
        .join("\n");

      const prompt = `Synthesize a succinct name (3-6 words) and 3 PDF product ideas for this problem cluster:
${signalSnippets}

Respond with JSON:
{
  "name": "Specific Problem Family Name",
  "products": ["Title 1 Checklist", "Title 2 Guide", "Title 3 Reference Sheet"]
}`;

      const res = await opts.router.generateObject({
        tier: opts.tier || "cheap",
        system: "You are a market research clustering specialist for procedural PDF products.",
        user: prompt,
        validate: (raw: unknown) => {
          if (typeof raw !== "object" || raw === null) throw new Error("not an object");
          const r = raw as Record<string, unknown>;
          if (typeof r.name !== "string" || !r.name.trim()) throw new Error("invalid name");
          if (!Array.isArray(r.products) || r.products.length === 0) throw new Error("invalid products");
          return {
            name: r.name.trim(),
            products: r.products.map(String).slice(0, 4),
          };
        },
        maxTokens: 300,
        temperature: 0.2,
      });

      if (res.object.name) name = res.object.name;
      if (res.object.products.length > 0) relatedProducts = res.object.products;
    } catch {
      // Fallback to deterministic rule generator on any provider error
    }
  }

  // Determine trend: if any signal has rising/accelerating, mark emerging/accelerating
  let trend: TrendDirection = "stable";
  const anyGtrends = signals.some((s) => s.sourceType === "gtrends");
  if (anyGtrends) {
    trend = "accelerating";
  }

  // Score the market candidate
  const scoringSignals = signals.map((s) => ({
    signalId: s.id,
    sourceType: s.sourceType,
    title: s.title,
    content: s.content,
    engagement: s.engagement,
    analysis: s.analysis,
  }));

  const scoring = scoreMarket(scoringSignals, { trend });

  // Growth metric: calculated based on momentum and trend
  const growth = scoring.factors.trendMomentum;

  return {
    id,
    name,
    frequency: signals.length,
    growth,
    audience,
    urgency,
    language,
    relatedProducts,
    centroid,
    signalIds: signals.map((s) => s.id),
    signals,
    scoring,
    trend,
  };
}
