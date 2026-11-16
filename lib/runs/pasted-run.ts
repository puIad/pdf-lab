// lib/runs/pasted-run.ts — server-side read of a run that waits for a pasted reply (Part 6.15).
// Shared by GET/POST /api/deep/<runId> and the /deep page, so both number the prompt identically.

import type { SupabaseClient } from "@supabase/supabase-js";
import { discussionsOnly, type StoredSignalForRun } from "./orchestrator.ts";
import { loadRunSignals } from "./run-signals.ts";
import { buildPastePrompt, promptSignals } from "./pasted.ts";

export interface PastedRunRow {
  id: string;
  query: string;
  mode: string;
  status: string;
  started_at: string;
  /** Who started the run; null for runs from the server key or a signed-out dev server. */
  user_id: string | null;
}

export interface PastedRunState {
  runId: string;
  seed: string;
  status: string;
  signals: number;
  /** Present only while the run waits for a reply (`classifying`). */
  prompt: string | null;
}

export async function loadPastedRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<{ run: PastedRunRow; signals: StoredSignalForRun[] } | null> {
  const { data: run, error } = await supabase
    .from("research_runs")
    .select("id, query, mode, status, started_at, user_id")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the run: ${error.message}`);
  if (!run) return null;
  return { run: run as PastedRunRow, signals: promptSignals(discussionsOnly(await loadRunSignals(supabase, runId))) };
}

export function pastedRunState(run: PastedRunRow, signals: StoredSignalForRun[]): PastedRunState {
  return {
    runId: run.id,
    seed: run.query,
    status: run.status,
    signals: signals.length,
    prompt: run.status === "classifying" ? buildPastePrompt(run.query, signals) : null,
  };
}
