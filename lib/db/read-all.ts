// lib/db/read-all.ts — reads every row of an ordered Supabase query, page by page.

/** PostgREST caps a response at max_rows (1000 on hosted Supabase), so reads go in ordered pages. */
const PAGE = 1000;

/** What a Supabase select builder offers once it is ordered: a page by range. */
export type Pageable = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

/**
 * Reads every row of an ordered query until a short page. The query needs a stable `.order()`
 * that ends in a unique column, or rows can repeat or go missing between pages.
 */
export async function readAll<T>(label: string, query: () => Pageable): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

/** Ids per request for an `.in()` filter: the list travels in the URL of a GET, so it stays short. */
const IN_CHUNK = 100;

/** `readAll` for a query filtered by an id list: one paged read per chunk of ids, results merged. */
export async function readAllIn<T>(label: string, ids: string[], query: (chunk: string[]) => Pageable): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) rows.push(...(await readAll<T>(label, () => query(ids.slice(i, i + IN_CHUNK)))));
  return rows;
}
