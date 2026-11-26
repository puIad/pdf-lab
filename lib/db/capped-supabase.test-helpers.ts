// lib/db/capped-supabase.test-helpers.ts — a Supabase stand-in that behaves like PostgREST's row cap:
// a request without `.range()` gets at most 1000 rows. It applies `.eq()` and `.in()` to the rows,
// so a test sees what scoping a read really did.

import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export function cappedSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let window: [number, number] = [0, 999];
      let limit = Infinity;
      const run = () => {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return { data: rows.slice(window[0], Math.min(window[1], window[0] + 999, window[0] + limit - 1) + 1), error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), builder),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), builder),
        limit: (n: number) => ((limit = n), builder),
        range: (from: number, to: number) => ((window = [from, to]), builder),
        maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
        then: (resolve: (v: ReturnType<typeof run>) => unknown) => Promise.resolve(resolve(run())),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}
