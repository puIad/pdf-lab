// lib/sources/gtrends/google-trends-api.d.ts — minimal typings for the
// untyped `google-trends-api@4.9.2` community client (unofficial Google Trends
// API; verified live 2026-09-17 — interestOverTime + relatedQueries return
// JSON strings). Only the methods the adapter uses are declared.

declare module "google-trends-api" {
  export interface TrendsTimeRange {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    geo?: string;
  }
  export interface TrendsKeyword {
    keyword: string;
  }
  const api: {
    interestOverTime(opts: TrendsTimeRange): Promise<string>;
    relatedQueries(opts: TrendsTimeRange): Promise<string>;
    autoComplete(opts: TrendsKeyword): Promise<string>;
  };
  export default api;
}
