// lib/brief/load.ts — read a brief's inputs from stored rows (Phase 3 Part 3.10 task 1).
// Two sources only: a Deep-run opportunity, or a quick idea whose Validate verdict is GO or WAIT.
// A KILL idea, or an idea with no stored phrase rows, gets no brief (BriefUnavailable).

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStoredIdeas } from "../ideas/stored.ts";
import type { IdeaEvidence, IdeaFormat } from "../ideas/ideas.ts";
import { loadStoredChecks, normalizePhrase, summarizeListings } from "../competition/check.ts";
import { mineReviewsAndGaps, type CompetitorProduct } from "../competition/index.ts";
import { parsePrice } from "../sources/marketplace-helper.ts";
import { isDemandOnly } from "../sources/demand-only.ts";
import { IDEA_CLAIM_PREFIX } from "../opportunities/from-ideas.ts";
import { generateMarketOverview } from "../search/overview.ts";
import type { EvidenceCitation, MarketOverview } from "../search/types.ts";
import { buildVerdict } from "../planner/verdict.ts";
import { verbatim, type BriefInput, type BriefPhrase, type BriefPrice } from "./build.ts";
import type { BriefCite, BriefFact, BriefMarketplace } from "./types.ts";

export class BriefUnavailable extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = "BriefUnavailable";
    this.status = status;
  }
}

const MAX_QUOTES = 8;
const PLATFORM_LABEL: Record<string, string> = { etsy: "Etsy", gumroad: "Gumroad", kdp: "Amazon KDP", amazon_kdp: "Amazon KDP" };
/** Sources whose text is a person talking: the only ones quoted as buyer language. */
const DISCUSSION = new Set(["reddit", "youtube"]);

const IDEA_PHRASE_RE = new RegExp(`${IDEA_CLAIM_PREFIX} "([^"]+)"`);

const FORMAT: Record<string, IdeaFormat> = {
  checklist: "Checklist",
  guide: "Guide",
  planner: "Planner",
  workbook: "Worksheet",
  template: "Worksheet",
  cheat_sheet: "Cheat sheet",
  tracker: "Planner",
  quick_reference: "Cheat sheet",
};

const cite = (e: IdeaEvidence): BriefCite => ({ id: e.source_id, source: e.source, url: e.url });

function citeOf(c: EvidenceCitation, fallbackSource = "signal"): BriefCite | null {
  const id = c.id ?? c.url;
  return id ? { id, source: c.source ?? fallbackSource, url: c.url ?? null } : null;
}

function dedupeFacts(facts: BriefFact[], max: number): BriefFact[] {
  const seen = new Set<string>();
  return facts.filter((f) => {
    const k = f.text.toLowerCase();
    if (!f.cites.length || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, max);
}

function overviewFacts(ov: MarketOverview) {
  const pains = ov.pains.value?.items ?? [];
  const quotes: BriefFact[] = [];
  for (const q of ov.buyerIntentSignals.value?.sampleQuotes ?? []) {
    const c = q.url ? { id: q.url, source: q.source ?? "signal", url: q.url } : null;
    // The overview falls back to a placeholder when a row has no text: not a quote.
    if (c && q.quote && q.quote !== "Customer intent statement" && DISCUSSION.has(c.source)) quotes.push({ text: `“${verbatim(q.quote)}”`, cites: [c] });
  }
  for (const p of pains) {
    for (const c of p.citations) {
      const bc = citeOf(c);
      if (bc && c.excerpt && DISCUSSION.has(bc.source)) quotes.push({ text: `“${verbatim(c.excerpt)}”`, cites: [bc] });
    }
  }
  const byAudience = new Map<string, { n: number; cites: BriefCite[] }>();
  for (const p of pains) {
    if (!p.audience) continue;
    const a = byAudience.get(p.audience) ?? { n: 0, cites: [] };
    a.n += p.frequency;
    a.cites.push(...p.citations.map((c) => citeOf(c)).filter((c): c is BriefCite => !!c));
    byAudience.set(p.audience, a);
  }
  const top = [...byAudience.entries()].sort((x, y) => y[1].n - x[1].n)[0];
  const audience: BriefFact | null = top && top[1].cites.length
    ? { text: `${top[0]}: ${top[1].n} pain signal${top[1].n === 1 ? "" : "s"} name this audience`, cites: top[1].cites.slice(0, 6) }
    : null;
  const gaps: BriefFact[] = [
    ...pains.map((p) => ({ text: `${p.problem} (observed ${p.frequency}×)`, cites: p.citations.map((c) => citeOf(c)).filter((c): c is BriefCite => !!c) })),
    ...(ov.underservedSubmarkets.value?.items ?? []).map((g) => ({
      text: `${g.name}: ${g.reason}`,
      cites: g.citations.map((c) => citeOf(c)).filter((c): c is BriefCite => !!c),
    })),
  ];
  return { quotes, audience, gaps: dedupeFacts(gaps, 6) };
}

/** Quick idea → brief input. Runs Validate on the phrase (stored counts, no LLM); KILL refuses. */
export async function loadIdeaBriefInput(supabase: SupabaseClient, seed: string, phrase: string): Promise<BriefInput> {
  const { result } = await loadStoredIdeas(supabase, seed);
  const key = normalizePhrase(phrase);
  const idea = result.ideas.find((i) => normalizePhrase(i.phrase) === key);
  if (!idea) throw new BriefUnavailable(`No stored quick idea "${phrase}" for the seed "${seed}". Scan the seed first.`);

  const overview = await generateMarketOverview(idea.phrase, supabase, { mode: "validate", persistRun: false });
  const verdict = buildVerdict(overview);
  if (verdict.verdict === "KILL") throw new BriefUnavailable(`Validate says KILL for "${idea.phrase}": ${verdict.reason}`, 409);

  const ideaCites = idea.evidence.map(cite);
  const { quotes, audience, gaps } = overviewFacts(overview);
  const searched: BriefFact[] = [idea, ...result.ideas.filter((i) => i.isQuestion && i !== idea).slice(0, 3)].map((i) => ({
    text: `Searched: “${i.phrase}”`,
    cites: i.evidence.map(cite),
  }));

  const check = (await loadStoredChecks(supabase, [idea.phrase]))[key] ?? null;
  let competition: BriefInput["competition"] = null;
  const prices: BriefPrice[] = [];
  if (check) {
    const listingCite = (l: { evidenceId: string; platform: string; url: string | null }): BriefCite => ({ id: l.evidenceId, source: l.platform, url: l.url });
    const counts = summarizeListings(check.platforms, check.listings);
    competition = {
      marketplaces: counts.map(({ platform, label, listings, withReviews, reviews }) => ({ platform, label, listings, withReviews, reviews })),
      cites: [...check.listings.map(listingCite), ...check.zeroRows.map((z) => listingCite({ ...z, url: null }))],
    };
    for (const l of check.listings) if (l.price) prices.push({ price: l.price, cite: listingCite(l) });
  }

  return {
    source: { kind: "idea", seed: result.seed, phrase: idea.phrase },
    title: idea.title,
    format: idea.format,
    mainPhrase: idea.phrase,
    mainCites: ideaCites,
    promise: {
      text: `A ${idea.format.toLowerCase()} that answers the search “${idea.phrase}”, observed ${idea.demandBasis}`,
      cites: ideaCites,
    },
    audience,
    related: result.ideas.map((i): BriefPhrase => ({ phrase: i.phrase, opportunity: i.opportunity, cites: i.evidence.map(cite) })),
    quotes: dedupeFacts([...searched, ...quotes], MAX_QUOTES),
    competition,
    prices,
    gaps,
    adviceText: idea.phrase,
    verdict,
  };
}

interface EvidenceRowRead {
  id: string;
  claim: string;
  excerpt: string | null;
  url: string | null;
  sources: { type?: string } | { type?: string }[] | null;
}
interface SignalRowRead {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  external_id: string | null;
  sources: { type?: string } | { type?: string }[] | null;
  signal_analysis: { problem?: string | null } | { problem?: string | null }[] | null;
}

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Deep-run opportunity → brief input. */
export async function loadOpportunityBriefInput(supabase: SupabaseClient, id: string): Promise<BriefInput> {
  const { data: opp, error } = await supabase
    .from("opportunities")
    .select("id, market_id, title, target_audience, problem, solution, format, markets ( id, name )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`failed to load opportunity: ${error.message}`);
  if (!opp) throw new BriefUnavailable(`No opportunity ${id}.`);
  const market = one(opp.markets as { id: string; name: string } | { id: string; name: string }[] | null);

  const [{ data: ev, error: evErr }, { data: ms, error: msErr }, { data: comps, error: cErr }] = await Promise.all([
    supabase.from("evidence").select("id, claim, excerpt, url, sources ( type )").eq("entity_id", id),
    supabase
      .from("market_signals")
      .select("signals ( id, title, content, url, external_id, sources ( type ), signal_analysis ( problem ) )")
      .eq("market_id", opp.market_id)
      .limit(200),
    supabase.from("competitors").select("id, platform, title, url, price, rating, review_count").eq("market_id", opp.market_id),
  ]);
  if (evErr || msErr || cErr) throw new Error(`failed to load brief rows: ${(evErr ?? msErr ?? cErr)!.message}`);

  const evidence = (ev ?? []) as EvidenceRowRead[];
  if (evidence.length === 0) throw new BriefUnavailable(`Opportunity ${id} has no stored evidence (QC Rule 1): no brief.`, 409);
  const evCite = (e: EvidenceRowRead): BriefCite => ({ id: e.id, source: one(e.sources)?.type ?? "evidence", url: e.url });
  const oppCites = evidence.map(evCite);

  const signals = ((ms ?? []) as unknown as { signals: SignalRowRead | SignalRowRead[] | null }[])
    .map((r) => one(r.signals))
    .filter((s): s is SignalRowRead => !!s && !isDemandOnly({ source_type: one(s.sources)?.type, external_id: s.external_id }));
  const sigCite = (s: SignalRowRead): BriefCite => ({ id: s.id, source: one(s.sources)?.type ?? "signal", url: s.url });

  // Phrases: quick-idea phrases traced into this opportunity's evidence, then analyzed problems.
  const byPhrase = new Map<string, BriefPhrase>();
  const addPhrase = (phrase: string, opportunity: number, c: BriefCite) => {
    const p = byPhrase.get(phrase);
    if (p) p.cites.push(c);
    else byPhrase.set(phrase, { phrase, opportunity, cites: [c] });
  };
  for (const e of evidence) {
    // The evidence writer prefixes claims ("[type: frequency | conf: 1.00] Quick-idea phrase ...").
    const m = e.claim.match(IDEA_PHRASE_RE);
    if (m) addPhrase(m[1].toLowerCase(), 60, evCite(e));
  }
  for (const s of signals) {
    const p = one(s.signal_analysis)?.problem?.trim();
    if (p && p.length <= 80) addPhrase(p.toLowerCase(), 50, sigCite(s));
  }
  const related = [...byPhrase.values()];
  const mainPhrase = related[0]?.phrase ?? (market?.name ?? opp.title).toLowerCase();

  const quotes: BriefFact[] = [
    ...[...byPhrase.values()].filter((p) => p.opportunity === 60).map((p) => ({ text: `Searched: “${p.phrase}”`, cites: p.cites })),
    ...evidence
      .filter((e) => e.excerpt && DISCUSSION.has(one(e.sources)?.type ?? ""))
      .map((e) => ({ text: `“${verbatim(e.excerpt!)}”`, cites: [evCite(e)] })),
    ...signals
      .filter((s) => s.content && DISCUSSION.has(one(s.sources)?.type ?? ""))
      .map((s) => ({ text: `“${verbatim(s.content!)}”`, cites: [sigCite(s)] })),
  ];

  const compRows = (comps ?? []) as { id: string; platform: string | null; title: string | null; url: string | null; price: string | null; rating: number | null; review_count: number | null }[];
  const compCite = (c: (typeof compRows)[number]): BriefCite => ({ id: c.id, source: c.platform ?? "marketplace", url: c.url });
  const byPlatform = new Map<string, BriefMarketplace>();
  for (const c of compRows) {
    const p = c.platform ?? "marketplace";
    const m = byPlatform.get(p) ?? { platform: p, label: PLATFORM_LABEL[p] ?? p, listings: 0, withReviews: 0, reviews: 0 };
    m.listings++;
    if (c.review_count !== null) {
      m.withReviews++;
      m.reviews += c.review_count;
    }
    byPlatform.set(p, m);
  }

  const products: CompetitorProduct[] = compRows.map((c) => ({
    id: c.id,
    platform: c.platform ?? "web",
    title: c.title ?? "Untitled product",
    url: c.url,
    price: c.price,
    priceNumeric: parsePrice(c.price).priceNumeric,
    format: "guide",
    rating: c.rating,
    reviewCount: c.review_count,
    positioning: null,
    promises: [],
    reviews: [],
  }));
  const { productGaps } = mineReviewsAndGaps(
    products,
    signals.map((s) => ({ title: s.title, content: s.content, url: s.url, source_type: one(s.sources)?.type ?? null })),
  );
  // Gap titles are the miner's fixed category texts (PC-repair wording), so the brief quotes the
  // observed excerpt instead. Its "gap-format-friction" fallback exists when nothing matched: skipped.
  const typeByUrl = new Map(signals.map((s) => [s.url, one(s.sources)?.type ?? "signal"]));
  const gaps: BriefFact[] = productGaps
    .filter((g) => g.id !== "gap-format-friction")
    .flatMap((g) =>
      (g.reviewExcerpts ?? [])
        .filter((r) => r.url && r.quote)
        .slice(0, 1)
        .map((r) => ({ text: `“${verbatim(r.quote)}”`, cites: [{ id: r.url as string, source: typeByUrl.get(r.url ?? null) ?? "review", url: r.url ?? null }] })),
    );

  return {
    source: { kind: "opportunity", id: opp.id },
    title: opp.title,
    format: FORMAT[opp.format] ?? "Guide",
    mainPhrase,
    mainCites: related[0]?.cites ?? oppCites,
    promise: { text: opp.solution, cites: oppCites },
    audience: opp.target_audience ? { text: opp.target_audience, cites: oppCites } : null,
    related,
    quotes: dedupeFacts(quotes, MAX_QUOTES),
    competition: compRows.length ? { marketplaces: [...byPlatform.values()], cites: compRows.map(compCite) } : null,
    prices: compRows.filter((c) => c.price).map((c) => ({ price: c.price as string, cite: compCite(c) })),
    gaps: dedupeFacts(gaps, 6),
    adviceText: [opp.title, opp.problem, market?.name].filter(Boolean).join(" "),
    verdict: null,
  };
}
