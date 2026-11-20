// lib/monitor/types.ts: shapes of scheduled monitoring (Phase 4 Part 4.2). Pure types, no database.

export interface SnapshotPhrase {
  phrase: string;
  demand: number;
  opportunity: number;
  trend: string | null;
}

/** One dated scan of a seed in a region (table `seed_snapshots`). */
export interface SeedSnapshot {
  seed: string;
  region: string;
  scannedAt: string;
  phrases: SnapshotPhrase[];
}

/** A phrase that changed between two dated snapshots. Both bases carry their dates (QC Rule 2). */
export type PhraseChange =
  | { basis: "new"; phrase: string; firstSeen: string; previousScan: string; demand: number }
  | { basis: "history"; phrase: string; from: { at: string; demand: number }; to: { at: string; demand: number } };

export interface Job {
  key: string;
  lastOkAt: string | null;
  failures: number;
  nextDueAt: string | null;
  lastError: string | null;
}

export interface Counts {
  discussions: number;
  analysed: number;
  buyerIntent: number;
  complaints: number;
  competitors: number;
}
export type CountKey = keyof Counts;

export interface NewItem {
  kind: "discussion" | "complaint" | "product";
  title: string | null;
  url: string | null;
}

/** A re-run of a watched seed against the run before it (PRD §44). */
export interface ChangeReport {
  seed: string;
  runId: string;
  baselineRunId: string | null;
  createdAt: string;
  baselineAt: string | null;
  current: Counts;
  baseline: Counts | null;
  /** current minus baseline, per count; always `added` minus `removed`. */
  deltas: Counts | null;
  added: Counts | null;
  removed: Counts | null;
  newItems: NewItem[];
  /** New discussions with no analysis (no model key, or extraction failed): their intent is not observed. */
  unanalysedNew: number;
  note: string | null;
}

export interface WatchTargets {
  seeds: Array<{ seed: string; region: string }>;
  marketSeeds: string[];
}

export interface MonitorStore {
  watchTargets(): Promise<WatchTargets>;
  getJob(key: string): Promise<Job | null>;
  saveJob(job: Job): Promise<void>;
  /** Oldest first. */
  snapshots(seed: string, region: string, limit?: number): Promise<SeedSnapshot[]>;
  saveSnapshot(s: SeedSnapshot): Promise<void>;
  saveReport(r: ChangeReport): Promise<void>;
  /** Newest first. */
  reports(seed: string, limit?: number): Promise<ChangeReport[]>;
}
