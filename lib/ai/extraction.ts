// lib/ai/extraction.ts — signal → structured analysis job (Phase 1 Part 1.3, batched in Part 6.9).
// Signals go to the model in batches (default 10 per call, one JSON item per signal keyed by its
// number); an item that is missing or invalid is retried alone, and so are the signals of a call
// that failed as a whole (malformed JSON, timeout). Single retries stop after three failures in a
// row, so a provider outage costs a few calls, not one per signal.
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
export const EXTRACTION_PROMPT_VERSION = "extract-v2-batch";

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
  batchSize: number;
  /** Model calls made: batch calls, and single calls (batch size 1, lone signals, retries). */
  calls: { batch: number; single: number };
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

const FIELD_RULES = `- "audience": who has this problem (short noun phrase, as the text itself describes them). Max 200 chars.
- "problem": the SPECIFIC problem evidenced IN THE TEXT (one sentence, concrete, no generic filler). Max 500 chars.
- "intent": buyer-intent ladder —
  - "weak": browsing, curiosity, venting, memes, general discussion; no action or solution language.
  - "medium": comparing options, asking how-to, considering a change; interest but no commitment.
  - "strong": explicit request for a solution, recommendation, or fix ("I need", "what should I use", "how do I fix", "help please").
  - "very_strong": explicit need PLUS buying/payment language, urgency, or commissioning ("willing to pay", "looking to buy", "need ASAP", hiring someone).
- "urgency": "low" (no time pressure) | "medium" (wants it resolved soon, recurring annoyance) | "high" (blocked, deadline, data loss, can't work).
- "pdf_relevance": 0..1 — how well a STATIC PDF (checklist, guide, planner, template, workbook, cheat-sheet, tracker) could solve this. Score HIGH for procedural/learnable problems; score LOW for physical repair, realtime/interactive needs, human services, or complex software.`;

const GROUNDING_RULE = `Rules: use ONLY the provided text — never invent details, never restate the task. If the text is thin, say what IS evidenced and choose weak/low with pdf_relevance near 0.`;

const SYSTEM_PROMPT = `You analyze ONE stored market-research signal (a forum post, search trend, or article snippet) for a PDF-product research engine.

Return a JSON object with EXACTLY these keys:
${FIELD_RULES}

${GROUNDING_RULE}`;

const BATCH_SYSTEM_PROMPT = `You analyze SEVERAL stored market-research signals (forum posts, search trends, or article snippets) for a PDF-product research engine. Each signal is numbered like [1], [2].

Return a JSON object {"items": [...]} with ONE item per signal, in the same order. Each item has EXACTLY these keys:
- "n": the signal's number, copied from its [n] label.
${FIELD_RULES}

Judge every signal from ITS OWN text only: never carry an audience, a problem or a detail from one signal into another.
${GROUNDING_RULE}`;

export function buildExtractionUserText(signal: ExtractionInput, maxChars = MAX_TEXT * 2): string | null {
  const title = (signal.title || "").trim();
  const content = (signal.content || "").trim();
  const combined = [title, content].filter(Boolean).join("\n\n").slice(0, maxChars);
  if (!combined) return null; // nothing to ground on — caller records failure
  return `Signal text:\n${combined}`;
}

/** Signals per model call (Part 6.9). 1 = one call per signal, the pre-6.9 behaviour. */
export const DEFAULT_BATCH_SIZE = 10;
export const MAX_BATCH_SIZE = 25;
/** Characters of one signal's text inside a batch. */
const BATCH_TEXT = 1500;
/** Single retries stop after this many failures in a row: the provider is down, not the signal. */
const MAX_CONSECUTIVE_RETRY_FAILURES = 3;

export interface ExtractionJobOptions {
  signals: ExtractionInput[];
  router: AIRouter;
  tier?: TaskTier;
  /** Signals per model call (default DEFAULT_BATCH_SIZE, max MAX_BATCH_SIZE). */
  batchSize?: number;
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

type CallOptions = Required<Pick<ExtractionJobOptions, "router">> & Pick<ExtractionJobOptions, "tier" | "providerName">;

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 300);

async function extractOne(signal: ExtractionInput, opts: CallOptions): Promise<ExtractionOutcome> {
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
    return { signalId: signal.id, ok: false, error: errorText(err) };
  }
}

/**
 * Reads a batch reply: each item is validated on its own, keyed by its [n] number. A missing or
 * invalid item fails alone. Throws only when the reply is not a batch at all or no item is valid,
 * so the router retries the call once.
 */
export function validateBatchExtraction(raw: unknown, count: number): Map<number, ExtractionResult | string> {
  const items = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error('batch extraction output must be {"items": [...]}');
  const out = new Map<number, ExtractionResult | string>();
  for (const item of items) {
    const n = Number((item as { n?: unknown } | null)?.n);
    if (!Number.isInteger(n) || n < 1 || n > count || out.has(n)) continue; // unknown or repeated number: ignored
    try {
      out.set(n, validateExtraction(item));
    } catch (err) {
      out.set(n, errorText(err));
    }
  }
  if (![...out.values()].some((v) => typeof v !== "string")) {
    throw new Error("batch extraction returned no valid item");
  }
  return out;
}

interface BatchResult {
  outcomes: ExtractionOutcome[];
  /** Signals with no valid item (missing, invalid, or the whole call failed): one single call each. */
  retry: ExtractionInput[];
  cost?: CostLogEntry;
}

/** One model call for several signals. */
async function extractBatch(signals: ExtractionInput[], opts: CallOptions): Promise<BatchResult> {
  const tier: TaskTier = opts.tier ?? "cheap";
  const user = signals
    .map((s, i) => `[${i + 1}]\n${buildExtractionUserText(s, BATCH_TEXT)!.replace(/^Signal text:\n/, "")}`)
    .join("\n\n---\n\n");
  const t0 = Date.now();
  try {
    const res = await opts.router.generateObject({
      tier,
      system: BATCH_SYSTEM_PROMPT,
      user: `Signals:\n\n${user}`,
      validate: (raw) => validateBatchExtraction(raw, signals.length),
      temperature: 0,
      maxTokens: 250 * signals.length + 200,
      providerName: opts.providerName,
    });
    const cost = opts.router.costEntry({ tier, provider: res.provider, model: res.model, usage: res.usage, latencyMs: Date.now() - t0 });
    const outcomes: ExtractionOutcome[] = [];
    const retry: ExtractionInput[] = [];
    signals.forEach((signal, i) => {
      const item = res.object.get(i + 1);
      if (item && typeof item !== "string") {
        outcomes.push({ signalId: signal.id, ok: true, analysis: item, provider: res.provider, model: res.model, attempts: res.attempts, cost });
      } else {
        retry.push(signal);
      }
    });
    return { outcomes, retry, cost };
  } catch {
    return { outcomes: [], retry: signals };
  }
}

export async function runExtractionJob(opts: ExtractionJobOptions): Promise<ExtractionJobSummary> {
  const tier = opts.tier ?? "cheap";
  const concurrency = Math.max(1, Math.min(8, Math.floor(opts.concurrency ?? 2) || 2));
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(opts.batchSize ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE));
  const delayMs = Math.max(0, opts.interCallDelayMs ?? 750);
  const sleepFn = opts.sleepFn ?? sleep;
  const call: CallOptions = { router: opts.router, tier, providerName: opts.providerName };

  const outcomes: ExtractionOutcome[] = [];
  const costLog: CostLogEntry[] = [];
  const calls = { batch: 0, single: 0 };

  // Empty text never reaches the model (06-EVIDENCE-CONTRACT: nothing to ground on).
  const withText: ExtractionInput[] = [];
  for (const signal of opts.signals) {
    if (buildExtractionUserText(signal)) withText.push(signal);
    else outcomes.push({ signalId: signal.id, ok: false, error: "empty signal text — nothing to ground on, no row written" });
  }

  const single = async (signal: ExtractionInput): Promise<ExtractionOutcome> => {
    calls.single++;
    const outcome = await extractOne(signal, call);
    if (outcome.ok) costLog.push(outcome.cost);
    return outcome;
  };

  const retry: ExtractionInput[] = [];
  const units: ExtractionInput[][] = [];
  for (let i = 0; i < withText.length; i += batchSize) units.push(withText.slice(i, i + batchSize));
  let next = 0;
  async function worker(): Promise<void> {
    while (next < units.length) {
      const i = next++;
      if (delayMs > 0 && i > 0) await sleepFn(delayMs);
      const unit = units[i];
      if (unit.length === 1) {
        outcomes.push(await single(unit[0]));
        continue;
      }
      calls.batch++;
      const res = await extractBatch(unit, call);
      outcomes.push(...res.outcomes);
      retry.push(...res.retry);
      if (res.cost) costLog.push(res.cost);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, () => worker()));

  // Only the ids without a valid item are retried, one call each.
  let consecutiveFailures = 0;
  for (const signal of retry) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_RETRY_FAILURES) {
      outcomes.push({ signalId: signal.id, ok: false, error: "not retried: the provider failed several single calls in a row" });
      continue;
    }
    if (delayMs > 0) await sleepFn(delayMs);
    const outcome = await single(signal);
    consecutiveFailures = outcome.ok ? 0 : consecutiveFailures + 1;
    outcomes.push(outcome);
  }

  const succeeded = outcomes.filter((o): o is ExtractionSuccess => o.ok);
  return {
    promptVersion: EXTRACTION_PROMPT_VERSION,
    tier,
    batchSize,
    calls,
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
