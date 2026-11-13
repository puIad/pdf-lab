// lib/report/observed.ts — values the report pages show, computed from stored rows only (Part 6.14).
// A page renders what these return or "Not observed". Nothing here has a default or a floor.

export const NOT_OBSERVED = "Not observed";

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** A market's linked signal as the pages and the export read it. */
export interface ReportSignal {
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
}) {
  const opportunityIds = new Set(input.opportunityIds);
  const backed = new Set(
    input.evidence.filter((e) => e.entity_type === "opportunity" && opportunityIds.has(e.entity_id)).map((e) => e.entity_id),
  );
  return {
    sourcesCovered: input.observations.sources.length,
    signalsCollected: input.observations.totalSignals,
    signalsAnalyzed: input.observations.analysedSignals,
    marketsIdentified: 1,
    opportunitiesGenerated: input.opportunityIds.length,
    evidenceCount: input.evidence.length,
    evidenceBackedOpportunitiesCount: backed.size,
  };
}
