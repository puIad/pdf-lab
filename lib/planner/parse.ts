// lib/planner/parse.ts — Natural-language → structured research query (PRD §26) + mode selection (PRD §27).
// Deterministic rules, zero LLM cost: same prompt → same plan. The rule-set version is logged per run.

import {
  PLANNER_PROMPT_VERSION,
  RESEARCH_MODES,
  type ModeSource,
  type PipelineDepth,
  type ResearchMode,
  type ResearchPlan,
  type StructuredQuery,
} from "./types.ts";

export const MODE_DEPTHS: Record<ResearchMode, PipelineDepth> = {
  explore: {
    label: "Explore — broad scan of stored evidence",
    ingests: false,
    steps: ["PRD §8 overview", "matching markets"],
  },
  validate: {
    label: "Validate — investigate your exact concept",
    ingests: false,
    steps: ["PRD §8 overview on the concept", "PRD §48 validation blocks", "evidence-derived risks"],
  },
  hunt: {
    label: "Hunt — filter stored markets for openings",
    ingests: false,
    steps: ["structured filters", "evidence-backed markets ranked by demand × confidence"],
  },
  deep: {
    label: "Deep Research — the pdf-lab <niche> pipeline",
    ingests: true,
    // PRD §28 signature flow
    steps: [
      "25 opportunities",
      "web research",
      "buyer signals",
      "trends",
      "competition",
      "gaps",
      "final report",
    ],
  },
  monitor: {
    label: "Monitor — multi-window trend snapshot",
    ingests: false,
    steps: ["7d / 30d / 90d / 12m windows over stored signals", "temporal evidence (QC Rule 2)"],
  },
};

const SIGNATURE_RE = /^\s*pdf-lab\s+(.+)$/i;
const EXPLICIT_RE = new RegExp(`^\\s*(${RESEARCH_MODES.join("|")})\\s*[:>–-]\\s*(.+)$`, "i");

const VALIDATE_RE =
  /\b(validate|is there (?:real |any )?demand for|would (?:people|anyone) (?:buy|pay for)|should i (?:make|build|sell|create)|my (?:idea|concept|pdf|product))\b/i;
const VALIDATE_LEAD_RE =
  /^(?:please\s+|can you\s+)?(?:validate|is there (?:real |any )?demand for|would (?:people|anyone) (?:buy|pay for)|should i (?:make|build|sell|create))\s*(?:(?:this|my)\s+(?:idea|concept|pdf|product)\s*)?[:–-]?\s*/i;
const MONITOR_RE = /\b(monitor|watch|track|keep an eye on)\b/i;
const DEEP_RE = /\b(deep research|deep dive|full report|25 opportunities)\b/i;

const INTENT_RE =
  /\b(?:(?:high|strong)[\s-]*(?:buyer[\s-]*)?intent|buyer[\s-]*intent|ready to buy|willing to pay|(?:people|they) (?:would )?pay)\b/gi;
const COMPETITION_RE = /\b(?:low[\s-]*competition|underserved|untapped|few competitors|no competition|market gaps?)\b/gi;
const HORIZON_RE = /\b(?:in the |within the |within )?next (\d+) (day|week|month)s?\b/i;
const SEASONAL_RE = /\b(?:seasonal(?:ly)?|holiday|back[\s-]to[\s-]school|tax season|christmas)\b/gi;
const RISING_RE = /\b(?:trending|rising|growing|emerging|fastest[\s-]growing|surg(?:e|ing)|hot)\b/gi;
const FORMAT_RE =
  /\b(templates?|checklists?|workbooks?|planners?|guides?|cheat ?sheets?|trackers?|worksheets?|playbooks?|swipe files?)\b/gi;
const AUDIENCE_RE =
  /\bfor\s+((?:[a-z][\w'-]*\s?){1,4}?)(?=\s+(?:with|who|that|in|on|about|and|to)\b|[,.?!+]|$)/i;

const FILLER_RE =
  /\b(?:pdfs?|markets?|niches?|ideas?|opportunit(?:y|ies)|find|show(?: me)?|give me|list|what(?:'s| is| are)?|which|problems?|people|asking|requests?|likely|with|and|in|the|a|an|of|to|that|are|is|me|topics?|products?|digital|sell(?:ing)?|any)\b/gi;

const STOP_WORDS = new Set([
  ...["the", "and", "for", "with", "that", "are", "who", "how", "what", "pdf", "pdfs"],
  ...["in", "on", "of", "to", "is", "an", "me", "my", "at", "by", "or", "as", "it", "be", "do", "so", "we", "us"],
]);

const HORIZON_UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

function normalizeFormat(f: string): string {
  return f.toLowerCase().replace(/\s+/g, " ").replace(/cheatsheet/, "cheat sheet").replace(/s$/, "");
}

function collapse(s: string): string {
  return s.replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Lowercase content tokens (≥2 chars so "pc" survives, no stop words) for DB text matching. */
export function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\w'-]+/)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
    ),
  ];
}

/** Text the DB search should match on: niche plus audience. */
export function searchTextOf(q: StructuredQuery): string {
  return [q.niche, q.audience].filter(Boolean).join(" ").trim();
}

function extractFilters(body: string) {
  const formats = [...new Set([...body.matchAll(FORMAT_RE)].map((m) => normalizeFormat(m[1])))];
  const horizon = body.match(HORIZON_RE);
  const horizonDays = horizon ? Number(horizon[1]) * HORIZON_UNIT_DAYS[horizon[2].toLowerCase()] : null;
  const seasonal = horizonDays !== null || new RegExp(SEASONAL_RE.source, "i").test(body);
  const rising = new RegExp(RISING_RE.source, "i").test(body);

  const audienceMatch = body.match(AUDIENCE_RE);
  let audience: string | null = null;
  if (audienceMatch) {
    // "for templates" names a format, not an audience
    const candidate = collapse(audienceMatch[1].replace(FORMAT_RE, "").replace(FILLER_RE, ""));
    audience = candidate.length > 0 ? candidate.toLowerCase() : null;
  }

  return {
    intent: new RegExp(INTENT_RE.source, "i").test(body) ? ("high" as const) : ("any" as const),
    competition: new RegExp(COMPETITION_RE.source, "i").test(body) ? ("low" as const) : ("any" as const),
    trend: seasonal ? ("seasonal" as const) : rising ? ("rising" as const) : ("any" as const),
    horizonDays,
    formats,
    audience,
    audienceSpan: audienceMatch?.[0] ?? null,
  };
}

function cleanNiche(body: string, audienceSpan: string | null): string {
  let t = body;
  if (audienceSpan) t = t.replace(audienceSpan, " ");
  for (const re of [
    INTENT_RE,
    COMPETITION_RE,
    HORIZON_RE,
    SEASONAL_RE,
    RISING_RE,
    FORMAT_RE,
    MONITOR_RE,
    DEEP_RE,
    FILLER_RE,
  ]) {
    t = t.replace(new RegExp(re.source, "gi"), " ");
  }
  return collapse(t.replace(/\d+/g, " ")).toLowerCase();
}

function inferMode(body: string, f: ReturnType<typeof extractFilters>): ResearchMode {
  if (VALIDATE_RE.test(body)) return "validate";
  if (DEEP_RE.test(body)) return "deep";
  if (MONITOR_RE.test(body)) return "monitor";
  if (f.intent === "high" || f.competition === "low" || f.formats.length > 0 || f.trend !== "any") {
    return "hunt";
  }
  return "explore";
}

/** The prompt as typed, minus a `pdf-lab ` or `<mode>:` prefix: the seed quick-idea rows are stored under. */
export function seedOf(prompt: string): string {
  const raw = prompt.trim();
  return (raw.match(SIGNATURE_RE)?.[1] ?? raw.match(EXPLICIT_RE)?.[2] ?? raw).trim().toLowerCase();
}

/**
 * Plan a research run from a natural-language prompt.
 * `forcedMode` (e.g. a UI mode picker) wins over prefix, signature and inference.
 */
export function planResearch(prompt: string, forcedMode?: ResearchMode): ResearchPlan {
  const raw = prompt.trim();
  let body = raw;
  let mode: ResearchMode | null = null;
  let modeSource: ModeSource = "inferred";
  let signatureNiche: string | null = null;

  const sig = raw.match(SIGNATURE_RE);
  const explicit = raw.match(EXPLICIT_RE);
  if (sig) {
    body = sig[1].trim();
    mode = "deep";
    modeSource = "signature";
    signatureNiche = body.toLowerCase();
  } else if (explicit) {
    body = explicit[2].trim();
    mode = explicit[1].toLowerCase() as ResearchMode;
    modeSource = "explicit";
  }

  const f = extractFilters(body);
  if (forcedMode) {
    mode = forcedMode;
    modeSource = "explicit";
  }
  mode ??= inferMode(body, f);

  let concept: string | null = null;
  if (mode === "validate") {
    concept = body.replace(VALIDATE_LEAD_RE, "").replace(/[?.!\s]+$/, "").trim() || body;
  }

  const niche = signatureNiche ?? (concept ? concept.toLowerCase() : cleanNiche(body, f.audienceSpan));

  return {
    mode,
    modeSource,
    query: {
      raw,
      niche,
      audience: f.audience,
      intent: f.intent,
      competition: f.competition,
      formats: f.formats,
      trend: f.trend,
      horizonDays: f.horizonDays,
      concept,
    },
    depth: MODE_DEPTHS[mode],
    promptVersion: PLANNER_PROMPT_VERSION,
  };
}
