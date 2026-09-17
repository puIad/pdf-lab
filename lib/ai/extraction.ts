// lib/ai/extraction.ts — signal → structured analysis job (Phase 1 Part 1.3).
// Per signal (title+content from the DB, NEVER invented): validated
// {audience, problem, intent, urgency, pdf_relevance} → one `signal_analysis`
// row per signal (04-SCHEMA invariant 3: re-runs UPDATE).
//
// Evidence contract (06): the model sees ONLY stored signal text; empty text
// is reported as a failure, never padded with confabulation. Every call is
// cost-logged (feeds Phase 5 pricing).

import type { AIRouter } from "./router.ts";
import type { CostLogEntry, TaskTier } from "./types.ts";
import { summarizeCostLog } from "./types.ts";
import type { CostLogSummary } from "./types.ts";

/** Prompt version — bump + record when wording changes (07-AI-ROUTER). */
export const EXTRACTION_PROMPT_VERSION = "extract-v1";

export const INTENT_VALUES = ["weak", "medium", "strong", "very_strong"] as const;
export type IntentValue = (typeof INTENT_VALUES)[number];

export const URGENCY_VALUES = ["low", "medium", "high"] as const;
export type UrgencyValue = (typeof URGENCY_VALUES)[number];

export interface ExtractionResult {
  audience: string;
  problem: string;
  intent: IntentValue;
  urgency: UrgencyValue;
  pdf_relevance: number;
}

/** One input signal — must come from the `signals` table (route enforces). */
export interface ExtractionInput {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
}

export interface ExtractionSuccess {
  signalId: string;
  ok: true;
  analysis: ExtractionResult;
  provider: string;
  model: string;
  attempts: number;
  cost: CostLogEntry;
}

export interface ExtractionFailure {
  signalId: string;
  ok: false;
  error: string;
}

export type ExtractionOutcome = ExtractionSuccess | ExtractionFailure;

export interface ExtractionJobSummary {
  promptVersion: string;
  tier: TaskTier;
  total: number;
  succeeded: number;
  failed: number;
  /** Per-signal analyses for the SUCCEEDED subset — the ONLY upsert source. */
  successes: Array<{ signalId: string; analysis: ExtractionResult; provider: string; model: string }>;
  failures: Array<{ signalId: string; error: string }>;
  costLog: CostLogEntry[];
  cost: CostLogSummary;
}

const MAX_TEXT = 2000;

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (s.length === 0) return null;
  return s.slice(0, max);
}

/**
 * Schema validator for extraction output (hand-rolled: zero new deps).
 * Throws with a specific reason — the router retries once, then the job
 * records a failure. Rejects out-of-range pdf_relevance (no silent clamp:
 * clamping hides model drift).
 */
export function validateExtraction(raw: unknown): ExtractionResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("extraction output must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const audience = cleanString(o.audience, 200);
  if (!audience) throw new Error("extraction.audience must be a non-empty string (<=200 chars)");
  const problem = cleanString(o.problem, 500);
  if (!problem) throw new Error("extraction.problem must be a non-empty string (<=500 chars)");
  const intentRaw = typeof o.intent === "string" ? o.intent.trim().toLowerCase() : "";
  if (!(INTENT_VALUES as readonly string[]).includes(intentRaw)) {
    throw new Error(`extraction.intent must be one of ${INTENT_VALUES.join("|")} (got ${JSON.stringify(o.intent)?.slice(0, 40)})`);
  }
  const urgencyRaw = typeof o.urgency === "string" ? o.urgency.trim().toLowerCase() : "";
  if (!(URGENCY_VALUES as readonly string[]).includes(urgencyRaw)) {
    throw new Error(`extraction.urgency must be one of ${URGENCY_VALUES.join("|")} (got ${JSON.stringify(o.urgency)?.slice(0, 40)})`);
  }
  const rel = typeof o.pdf_relevance === "string" ? Number(o.pdf_relevance) : o.pdf_relevance;
  if (typeof rel !== "number" || !Number.isFinite(rel) || rel < 0 || rel > 1) {
    throw new Error(`extraction.pdf_relevance must be a number 0..1 (got ${JSON.stringify(o.pdf_relevance)?.slice(0, 40)})`);
  }
  return {
    audience,
    problem,
    intent: intentRaw as IntentValue,
    urgency: urgencyRaw as UrgencyValue,
    pdf_relevance: rel,
  };
}

const SYSTEM_PROMPT = `You analyze ONE stored market-research signal (a forum post, search trend, or article snippet) for a PDF-product research engine.

Return a JSON object with EXACTLY these keys:
- "audience": who has this problem (short noun phrase, e.g. "first-time PC builders", "parents troubleshooting family PCs"). Max 200 chars.
- "problem": the SPECIFIC problem evidenced IN THE TEXT (one sentence, concrete, no generic filler). Max 500 chars.
- "intent": buyer-intent ladder —
  - "weak": browsing, curiosity, venting, memes, general discussion; no action or solution language.
  - "medium": comparing options, asking how-to, considering a change; interest but no commitment.
  - "strong": explicit request for a solution, recommendation, or fix ("I need", "what should I use", "how do I fix", "help please").
  - "very_strong": explicit need PLUS buying/payment language, urgency, or commissioning ("willing to pay", "looking to buy", "need ASAP", hiring someone).
- "urgency": "low" (no time pressure) | "medium" (wants it resolved soon, recurring annoyance) | "high" (blocked, deadline, data loss, can't work).
- "pdf_relevance": 0..1 — how well a STATIC PDF (checklist, guide, planner, template, workbook, cheat-sheet, tracker) could solve this. Score HIGH for procedural/learnable problems; score LOW for physical repair, realtime/interactive needs, human services, or complex software.

Rules: use ONLY the provided text — never invent details, never restate the task. If the text is thin, say what IS evidenced and choose weak/low with pdf_relevance near 0.`;

export function buildExtractionUserText(signal: ExtractionInput): string | null {
  const title = (signal.title || "").trim();
  const content = (signal.content || "").trim();
  const combined = [title, content].filter(Boolean).join("\n\n").slice(0, MAX_TEXT * 2);
  if (!combined) return null; // nothing to ground on — caller records failure
  return `Signal text:\n${combined}`;
}

export interface ExtractionJobOptions {
  signals: ExtractionInput[];
  router: AIRouter;
  tier?: TaskTier;
  /** Parallel in-flight calls (default 2 — free shared pools rate-limit). */
  concurrency?: number;
  /** Ms between dispatching calls (default 750 — same reason). */
  interCallDelayMs?: number;
  providerName?: string;
  sleepFn?: (ms: number) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractOne(
  signal: ExtractionInput,
  opts: Required<Pick<ExtractionJobOptions, "router">> &
    Pick<ExtractionJobOptions, "tier" | "providerName">,
): Promise<ExtractionOutcome> {
  const user = buildExtractionUserText(signal);
  if (!user) {
    return { signalId: signal.id, ok: false, error: "empty signal text — nothing to ground on, no row written" };
  }
  const t0 = Date.now();
  try {
    const tier: TaskTier = opts.tier ?? "cheap";
    const res = await opts.router.generateObject({
      tier,
      system: SYSTEM_PROMPT,
      user,
      validate: validateExtraction,
      temperature: 0,
      maxTokens: 500,
      providerName: opts.providerName,
    });
    const latencyMs = Date.now() - t0;
    return {
      signalId: signal.id,
      ok: true,
      analysis: res.object,
      provider: res.provider,
      model: res.model,
      attempts: res.attempts,
      cost: opts.router.costEntry({
        tier,
        provider: res.provider,
        model: res.model,
        usage: res.usage,
        latencyMs,
      }),
    };
  } catch (err) {
    return {
      signalId: signal.id,
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
    };
  }
}

export async function runExtractionJob(opts: ExtractionJobOptions): Promise<ExtractionJobSummary> {
  const tier = opts.tier ?? "cheap";
  const concurrency = Math.max(1, Math.min(8, Math.floor(opts.concurrency ?? 2) || 2));
  const delayMs = Math.max(0, opts.interCallDelayMs ?? 750);
  const sleepFn = opts.sleepFn ?? sleep;
  const outcomes: ExtractionOutcome[] = new Array(opts.signals.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < opts.signals.length) {
      const i = next++;
      if (delayMs > 0 && i > 0) await sleepFn(delayMs);
      outcomes[i] = await extractOne(opts.signals[i], {
        router: opts.router,
        tier,
        providerName: opts.providerName,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, opts.signals.length) }, () => worker()));

  const succeeded = outcomes.filter((o): o is ExtractionSuccess => o.ok);
  const costLog = succeeded.map((o) => o.cost);
  return {
    promptVersion: EXTRACTION_PROMPT_VERSION,
    tier,
    total: outcomes.length,
    succeeded: succeeded.length,
    failed: outcomes.length - succeeded.length,
    successes: succeeded.map((o) => ({
      signalId: o.signalId,
      analysis: o.analysis,
      provider: o.provider,
      model: o.model,
    })),
    failures: outcomes
      .filter((o): o is ExtractionFailure => !o.ok)
      .map((o) => ({ signalId: o.signalId, error: o.error })),
    costLog,
    cost: summarizeCostLog(costLog),
  };
}
