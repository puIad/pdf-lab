// lib/sources/demand-only.ts — signal rows that measure demand, not discussions.
// Autocomplete phrases, Wikipedia pageviews and Serper PAA / related-search phrases (Part 3.7,
// stored under the `web` source with a `serp:` external id) feed quick ideas only. Every other
// reader of `signals` filters them out: they are not discussions, never go through extraction,
// and never become market evidence.

export const PHRASE_ID_PREFIX = "serp:";
const DEMAND_ONLY_SOURCES = new Set(["autocomplete", "wikipedia"]);

export function isDemandOnly(row: { source_type?: string | null; external_id?: string | null }): boolean {
  return DEMAND_ONLY_SOURCES.has(row.source_type ?? "") || (row.external_id?.startsWith(PHRASE_ID_PREFIX) ?? false);
}
