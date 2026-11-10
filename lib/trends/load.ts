// lib/trends/load.ts — stored markets + signals -> radar topics. No fixtures, no fallbacks:
// a market with no dated, non-template, non-demand-only signal yields an empty signal list and
// the detector reports it with no trend claim (QC Rule 2).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignalRecord } from "./detector.ts";
import { TrendingRadarService, type MarketTopicData } from "./service.ts";
import { isDemandOnly } from "../sources/demand-only.ts";
import { isTemplateRow } from "../brief/load.ts";

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface SignalRow {
  id: string;
  external_id: string | null;
  url: string | null;
  title: string | null;
  content: string | null;
  published_at: string | null;
  engagement: Record<string, unknown> | null;
  sources: Rel<{ type: string | null }>;
  signal_analysis: Rel<{ intent: string | null; urgency: string | null }>;
}
interface LinkRow {
  market_id: string;
  signals: Rel<SignalRow>;
}

export async function loadStoredMarketTopics(supabase: SupabaseClient): Promise<MarketTopicData[]> {
  const { data: markets, error } = await supabase.from("markets").select("id, name, description");
  if (error) throw new Error(`Failed to load markets: ${error.message}`);
  if (!markets?.length) return [];
  const ids = markets.map((m) => m.id as string);

  // PostgREST caps a response at max_rows (1000 on hosted Supabase), so read in ordered pages.
  const PAGE = 1000;
  const links: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: linkErr } = await supabase
      .from("market_signals")
      .select(
        "market_id, signal_id, signals(id, external_id, url, title, content, published_at, engagement, sources(type), signal_analysis(intent, urgency))",
      )
      .in("market_id", ids)
      .order("market_id")
      .order("signal_id")
      .range(from, from + PAGE - 1);
    if (linkErr) throw new Error(`Failed to load market signals: ${linkErr.message}`);
    links.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const { data: comps, error: compErr } = await supabase.from("competitors").select("market_id").in("market_id", ids);
  if (compErr) throw new Error(`Failed to load competitors: ${compErr.message}`);

  const signalsByMarket = new Map<string, SignalRecord[]>();
  for (const link of links as LinkRow[]) {
    const s = one(link.signals);
    if (!s || !s.published_at) continue; // undated rows cannot carry a trend (QC Rule 2)
    const sourceType = one(s.sources)?.type ?? "";
    if (isDemandOnly({ source_type: sourceType, external_id: s.external_id }) || isTemplateRow(s)) continue;
    const analysis = one(s.signal_analysis);
    const list = signalsByMarket.get(link.market_id) ?? [];
    list.push({
      id: s.id,
      sourceType,
      title: s.title,
      content: s.content,
      publishedAt: s.published_at,
      engagement: s.engagement,
      intent: analysis?.intent ?? null,
      urgency: analysis?.urgency ?? null,
    });
    signalsByMarket.set(link.market_id, list);
  }

  const compCount = new Map<string, number>();
  for (const c of comps ?? []) compCount.set(c.market_id as string, (compCount.get(c.market_id as string) ?? 0) + 1);

  // markets has no category column; "general" keeps the filter shape without inventing one.
  return markets
    .map((m) => ({
      id: m.id as string,
      name: m.name as string,
      category: "general",
      signals: signalsByMarket.get(m.id as string) ?? [],
      competitorCount: compCount.get(m.id as string) ?? 0,
    }))
    .filter((t) => t.signals.length > 0);
}

export async function getTrendingRadarService(supabase: SupabaseClient): Promise<TrendingRadarService> {
  return new TrendingRadarService(await loadStoredMarketTopics(supabase));
}
