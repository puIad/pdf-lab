// lib/report/observed.ts — values the report pages show, computed from stored rows only (Part 6.14).
// A page renders what these return or "Not observed". Nothing here has a default or a floor.

export const NOT_OBSERVED = "Not observed";

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** A market's linked signal as the pages and the export read it. */
export interface ReportSignal {
  published_at?: string | null;
  sources?: Rel<{ type?: string | null }>;
  signal_analysis?: Rel<{
    audience?: string | null;
    problem?: string | null;
    urgency?: string | null;
    pdf_relevance?: number | null;
  }>;
}

export interface MarketObservations {
  totalSignals: number;
  analysedSignals: number;
  /** Distinct source types among the market's signals. */
  sources: string[];
  /** Most frequent extracted problems, with the audience extraction stored beside them. */
  problems: Array<{ problem: string; audience: string | null; count: number }>;
  urgency: { high: number; medium: number; low: number };
  /** Mean `pdf_relevance` over analysed signals that carry one; null when none does. */
  avgPdfRelevance: number | null;
}

export function observeMarket(signals: ReportSignal[], maxProblems = 5): MarketObservations {
  const sources = new Set<string>();
  const problems = new Map<string, { problem: string; audience: string | null; count: number }>();
  const urgency = { high: 0, medium: 0, low: 0 };
  const relevance: number[] = [];
  let analysed = 0;

  for (const s of signals) {
    const type = one(s.sources)?.type;
    if (type) sources.add(type);
    const a = one(s.signal_analysis);
    if (!a) continue;
    analysed++;
    const problem = a.problem?.trim();
    if (problem) {
      const key = problem.toLowerCase();
      const entry = problems.get(key) ?? { problem, audience: a.audience?.trim() || null, count: 0 };
      entry.count++;
      problems.set(key, entry);
    }
    const u = a.urgency?.toLowerCase().trim();
    if (u === "high" || u === "medium" || u === "low") urgency[u]++;
    if (typeof a.pdf_relevance === "number") relevance.push(a.pdf_relevance);
  }

  return {
    totalSignals: signals.length,
    analysedSignals: analysed,
    sources: [...sources].sort(),
    problems: [...problems.values()].sort((x, y) => y.count - x.count).slice(0, maxProblems),
    urgency,
    avgPdfRelevance: relevance.length
      ? Math.round((relevance.reduce((n, v) => n + v, 0) / relevance.length) * 100) / 100
      : null,
  };
}

/** Stored competitor rows counted per platform, largest first. */
export function platformCounts(rows: Array<{ platform?: string | null }>): Array<{ platform: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const platform = r.platform || "unknown";
    counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  return [...counts.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
}

/**
 * Completeness inputs for ONE market, straight from its stored rows: the panel shows these numbers
 * and each equals a `select count(*)` on the same rows.
 */
export function marketCompletenessCounts(input: {
  observations: MarketObservations;
  opportunityIds: string[];
  evidence: Array<{ entity_type: string; entity_id: string }>;
  /** The market's QC rule results; when given they take the 15 points "markets identified" had. */
  rules?: QcRuleResult[];
}) {
  const opportunityIds = new Set(input.opportunityIds);
  const backed = new Set(
    input.evidence.filter((e) => e.entity_type === "opportunity" && opportunityIds.has(e.entity_id)).map((e) => e.entity_id),
  );
  const checked = input.rules?.filter((r) => r.held !== null);
  return {
    sourcesCovered: input.observations.sources.length,
    signalsCollected: input.observations.totalSignals,
    signalsAnalyzed: input.observations.analysedSignals,
    marketsIdentified: 1,
    opportunitiesGenerated: input.opportunityIds.length,
    evidenceCount: input.evidence.length,
    evidenceBackedOpportunitiesCount: backed.size,
    ...(checked ? { qcRulesChecked: checked.length, qcRulesHeld: checked.filter((r) => r.held).length } : {}),
  };
}

/** One QC rule (docs/EVIDENCE-CONTRACT.md) checked on stored rows: held, broken, or nothing to check (null). */
export interface QcRuleResult {
  rule: 1 | 2 | 3 | 4 | 5;
  held: boolean | null;
  text: string;
}

export interface QcEvidenceRow {
  entity_type: string;
  entity_id: string;
  source_id?: string | null;
  url?: string | null;
  excerpt?: string | null;
}

// The write-time test of QC Rule 1 (lib/evidence/qc.ts): a row names a source and quotes or links it.
const sourced = (e: QcEvidenceRow) => Boolean(e.source_id) && Boolean(e.url || e.excerpt);
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * The five QC rules checked on ONE market's stored rows. Each result is a count over those rows,
 * so the panel and the export state what was found, never that a rule is "enforced".
 */
export function marketQcRules(input: {
  market: { trend: string | null; demand_score: number | null; competition_score: number | null };
  signals: ReportSignal[];
  competitorCount: number;
  opportunityIds: string[];
  evidence: QcEvidenceRow[];
}): QcRuleResult[] {
  const { market, signals, competitorCount, evidence } = input;

  const opps = new Set(input.opportunityIds);
  const backed = new Set(
    evidence.filter((e) => e.entity_type === "opportunity" && opps.has(e.entity_id) && sourced(e)).map((e) => e.entity_id),
  ).size;
  const r1: QcRuleResult =
    opps.size === 0
      ? { rule: 1, held: null, text: "No opportunities stored" }
      : { rule: 1, held: backed === opps.size, text: `${backed} of ${opps.size} opportunities have a sourced evidence row` };

  // Dated observations as the orchestrator counts them: a publish date, or a Google Trends row.
  const dated = signals.filter((s) => s.published_at || one(s.sources)?.type === "gtrends").length;
  const trend = market.trend?.trim().toLowerCase() || "unknown";
  const r2: QcRuleResult =
    trend === "unknown"
      ? { rule: 2, held: true, text: `No trend claimed (${count(dated, "dated observation")})` }
      : {
          rule: 2,
          held: dated >= 2,
          text: `Trend "${trend}" from ${count(dated, "dated observation")}${dated >= 2 ? "" : ", 2 needed"}`,
        };

  const r3: QcRuleResult =
    competitorCount > 0
      ? { rule: 3, held: true, text: `Competition from ${count(competitorCount, "stored listing")}` }
      : market.competition_score != null
        ? { rule: 3, held: false, text: `Competition score ${Math.round(market.competition_score)} with no stored listing` }
        : { rule: 3, held: true, text: "No competition claimed: none observed" };

  const r4: QcRuleResult =
    market.demand_score == null
      ? { rule: 4, held: null, text: "No demand score stored" }
      : {
          rule: 4,
          held: signals.length > 0 || market.demand_score === 0,
          text: `Demand ${Math.round(market.demand_score)} from ${count(signals.length, "linked signal")}`,
        };

  // The three layers are separate tables; as at write time (enforceRule5), interpretations and
  // suggestions need a facts layer under them. A citation may be a computed count (trend rows) or
  // a listing with no `sources` row, so a missing source_id is not a separation failure.
  const analysed = signals.filter((s) => one(s.signal_analysis)).length;
  const layers = `${count(evidence.length, "citation")}, ${count(analysed, "analysed signal")}, ${count(opps.size, "suggestion")} stored apart`;
  const r5: QcRuleResult =
    evidence.length === 0 && analysed + opps.size === 0
      ? { rule: 5, held: null, text: "Nothing stored to separate" }
      : { rule: 5, held: evidence.length > 0, text: evidence.length > 0 ? layers : `${layers}, with no facts layer` };

  return [r1, r2, r3, r4, r5];
}
