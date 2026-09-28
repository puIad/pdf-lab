// lib/planner/types.ts — NL research planner types per PRD §26–§28 (Phase 3 Part 3.4).

/** Bump + record when parsing rules change (logged per run in research_runs.prompt_version). */
export const PLANNER_PROMPT_VERSION = "planner-rules-2026-09-28.1";

export const RESEARCH_MODES = ["explore", "validate", "hunt", "deep", "monitor"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

/** How the mode was chosen: typed prefix, `pdf-lab <niche>` signature, or inferred from wording. */
export type ModeSource = "explicit" | "signature" | "inferred";

export interface StructuredQuery {
  raw: string;
  /** Topic text used for DB matching ("" when the question only carries filters). */
  niche: string;
  audience: string | null;
  intent: "any" | "high";
  competition: "any" | "low";
  formats: string[];
  trend: "any" | "rising" | "seasonal";
  horizonDays: number | null;
  /** Validate only: the user's exact concept, investigated as-is (PRD §48). */
  concept: string | null;
}

/** What each mode runs (PRD §27). */
export interface PipelineDepth {
  label: string;
  ingests: boolean;
  steps: string[];
}

export interface ResearchPlan {
  mode: ResearchMode;
  modeSource: ModeSource;
  query: StructuredQuery;
  depth: PipelineDepth;
  promptVersion: string;
}
