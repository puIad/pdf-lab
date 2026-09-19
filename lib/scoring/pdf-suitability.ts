// lib/scoring/pdf-suitability.ts — PRD §17 PDF-suitability evaluator.
// Evaluates whether a problem domain is suitable for a static PDF deliverable
// (checklist, guide, planner, workbook, template, cheat sheet) vs unsuitable
// (physical repair, real-time software, hands-on human service).

import type { PdfSuitabilityEvaluation } from "./types.ts";

const HIGH_SUITABILITY_KEYWORDS: Array<{ term: string; format: string; reason: string }> = [
  { term: "checklist", format: "checklist", reason: "verifiable step-by-step verification points" },
  { term: "guide", format: "guide", reason: "structured procedural instruction" },
  { term: "step by step", format: "guide", reason: "sequential diagnostic flow" },
  { term: "how to", format: "guide", reason: "educational problem resolution" },
  { term: "cheat sheet", format: "cheat_sheet", reason: "quick-reference command or setting tables" },
  { term: "cheatsheet", format: "cheat_sheet", reason: "quick-reference command or setting tables" },
  { term: "reference", format: "cheat_sheet", reason: "quick-reference lookup table" },
  { term: "bios", format: "cheat_sheet", reason: "BIOS setting reference matrix and options" },
  { term: "boot", format: "diagnostic_flowchart", reason: "ordered boot sequence troubleshooting" },
  { term: "workflow", format: "workflow_diagram", reason: "process mapping" },
  { term: "template", format: "template", reason: "reusable document scaffold" },
  { term: "planner", format: "planner", reason: "scheduled planning and tracking" },
  { term: "workbook", format: "workbook", reason: "guided exercises and diagnostics" },
  { term: "setup", format: "checklist", reason: "initial hardware/software configuration checks" },
  { term: "troubleshoot", format: "diagnostic_flowchart", reason: "branching troubleshooting logic" },
  { term: "diagnos", format: "diagnostic_flowchart", reason: "systematic diagnostic steps" },
  { term: "error code", format: "cheat_sheet", reason: "error code and beep code catalog" },
  { term: "driver", format: "guide", reason: "clean driver installation and rollback steps" },
  { term: "wifi", format: "checklist", reason: "network stack and adapter diagnostic checklist" },
  { term: "overheat", format: "checklist", reason: "thermal troubleshooting and airflow checklist" },
  { term: "blue screen", format: "diagnostic_flowchart", reason: "BSOD stop-code diagnostic tree" },
  { term: "bsod", format: "diagnostic_flowchart", reason: "BSOD stop-code diagnostic tree" },
];

const LOW_SUITABILITY_KEYWORDS: Array<{ term: string; reason: string }> = [
  { term: "solder", reason: "physical micro-soldering requires physical tools and workshop, not a PDF" },
  { term: "welding", reason: "physical manufacturing repair" },
  { term: "capacitor replacement", reason: "component-level physical electronic repair" },
  { term: "realtime", reason: "requires real-time interactive software or telemetry" },
  { term: "real-time", reason: "requires real-time interactive software or telemetry" },
  { term: "fps counter", reason: "requires live background software overlay" },
  { term: "overlay software", reason: "executable application required" },
  { term: "in-person", reason: "physical on-site human technician service" },
  { term: "technician visit", reason: "physical service engagement" },
  { term: "rewrite driver", reason: "complex software engineering/kernel programming" },
  { term: "firmware reverse", reason: "complex software binary reverse engineering" },
];

export interface PdfSuitabilityInput {
  problem: string;
  audience?: string | null;
  extractedRelevance?: number | null; // 0..1 from signal_analysis.pdf_relevance if available
}

export function evaluatePdfSuitability(input: PdfSuitabilityInput): PdfSuitabilityEvaluation {
  const text = `${input.problem || ""} ${input.audience || ""}`.toLowerCase();
  const reasons: string[] = [];
  const formats = new Set<string>();

  let positiveScore = 0.5; // neutral baseline for general troubleshooting
  let negativePenalty = 0;

  // Check positive indicators
  for (const item of HIGH_SUITABILITY_KEYWORDS) {
    if (text.includes(item.term)) {
      positiveScore += 0.08;
      formats.add(item.format);
      if (!reasons.includes(item.reason)) {
        reasons.push(item.reason);
      }
    }
  }

  // Check negative indicators
  for (const item of LOW_SUITABILITY_KEYWORDS) {
    if (text.includes(item.term)) {
      negativePenalty += 0.35;
      reasons.push(`Low suitability: ${item.reason}`);
    }
  }

  // Factor in extractedRelevance if available
  let rawScore: number;
  if (typeof input.extractedRelevance === "number" && Number.isFinite(input.extractedRelevance)) {
    // 50% keyword heuristic, 50% model extraction
    rawScore = (positiveScore - negativePenalty) * 0.5 + input.extractedRelevance * 0.5;
  } else {
    rawScore = positiveScore - negativePenalty;
  }

  // Clamp to 0..1
  const score = Math.max(0, Math.min(1, Math.round(rawScore * 100) / 100));

  if (formats.size === 0) {
    formats.add("guide");
    formats.add("checklist");
  }

  if (reasons.length === 0) {
    reasons.push("Standard procedural guide or reference manual format");
  }

  return {
    score,
    isSuitable: score >= 0.4,
    recommendedFormats: [...formats],
    reasons,
  };
}
