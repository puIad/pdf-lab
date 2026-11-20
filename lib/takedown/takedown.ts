// lib/takedown/takedown.ts — the takedown blocklist (issue #76). A blocked URL is deleted from
// storage and skipped by every later collect. The key is the URL normalized so that http/https,
// www, a trailing slash, a fragment, tracking parameters and a Google redirect wrapper all name
// the same page.

import type { SupabaseClient } from "@supabase/supabase-js";

const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|mc_[a-z]+$|ref$|ref_$)/i;

/** The blocklist key for a URL, or null when the text is not an http(s) URL. */
export function normalizeUrlKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  // A Google redirect (google.com/url?q=<target>) names its target.
  if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === "/url") {
    const target = u.searchParams.get("q") ?? u.searchParams.get("url");
    if (target && target !== raw) return normalizeUrlKey(target);
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : "";
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${host}${path}${params ? `?${params}` : ""}`;
}

/** Keys of the given URLs that are on the blocklist. */
export async function readBlockedKeys(supabase: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 50) {
    const { data, error } = await supabase.from("takedowns").select("url_key").in("url_key", unique.slice(i, i + 50));
    if (error) throw new Error(`takedowns lookup failed: ${error.message}`);
    for (const r of (data ?? []) as { url_key: string }[]) out.add(r.url_key);
  }
  return out;
}

export interface TakedownResult {
  urlKey: string;
  deleted: { signals: number; evidence: number; competitors: number };
}

interface Target {
  table: "signals" | "evidence" | "competitors";
  columns: string[];
}
const TARGETS: Target[] = [
  { table: "signals", columns: ["url", "external_id"] },
  { table: "evidence", columns: ["url"] },
  { table: "competitors", columns: ["url"] },
];

/** Block a URL, then delete every stored row whose URL has the same key. Blocks first, so a collect
 * running meanwhile cannot store it again. Dependent rows (analysis, market and run links) cascade. */
export async function addTakedown(supabase: SupabaseClient, url: string, reason?: string): Promise<TakedownResult> {
  const urlKey = normalizeUrlKey(url);
  if (!urlKey) throw new Error("takedown needs an http or https URL");
  const { error } = await supabase
    .from("takedowns")
    .upsert({ url_key: urlKey, url: url.trim(), reason: reason ?? null }, { onConflict: "url_key" });
  if (error) throw new Error(`takedown insert failed: ${error.message}`);

  const host = urlKey.split(/[/?]/)[0];
  const deleted = { signals: 0, evidence: 0, competitors: 0 };
  for (const { table, columns } of TARGETS) {
    // A Google redirect row does not contain the target host in a form we can rely on, so match on
    // the host text anywhere in the column, then compare keys in code.
    const filter = columns.map((c) => `${c}.ilike.%${host}%`).join(",");
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: selErr } = await supabase
        .from(table)
        .select(["id", ...columns].join(", "))
        .or(filter)
        .order("id")
        .range(from, from + 999);
      if (selErr) throw new Error(`${table} lookup failed: ${selErr.message}`);
      const rows = (data ?? []) as unknown as Record<string, string | null>[];
      for (const r of rows) if (columns.some((c) => normalizeUrlKey(r[c]) === urlKey)) ids.push(r.id as string);
      if (rows.length < 1000) break;
    }
    for (let i = 0; i < ids.length; i += 100) {
      const { error: delErr } = await supabase.from(table).delete().in("id", ids.slice(i, i + 100));
      if (delErr) throw new Error(`${table} delete failed: ${delErr.message}`);
    }
    deleted[table] = ids.length;
  }
  return { urlKey, deleted };
}
