// lib/runs/use-run-poll.ts: client hook that follows a background run (issue #24) by polling
// GET /api/runs/<id> until it is `completed` or `failed`. A failed request is retried on the
// next tick: the run lives in the database, not in this tab.

"use client";

import { useEffect, useState } from "react";
import type { LifecycleTraceStep, ResearchCompleteness, RunWork } from "./types.ts";

export interface PolledRun {
  run: { id: string; query: string; mode: string; status: string; startedAt: string; completedAt: string | null };
  lifecycle: { currentState: string; trace: LifecycleTraceStep[] };
  completeness: ResearchCompleteness;
  work: RunWork | null;
  error: string | null;
}

export const isFinalStatus = (status: string): boolean => status === "completed" || status === "failed";

const POLL_MS = 3000;

/** The latest state of run `runId` (null until the first answer). Stops once the run is final. */
export function useRunPoll(runId: string | null): { data: PolledRun | null; refused: string | null } {
  const [data, setData] = useState<PolledRun | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      let final = false;
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        const body = await res.json();
        if (stopped) return;
        if (res.status === 403 || res.status === 404) {
          setRefused(body.error ?? `Request failed (${res.status})`);
          final = true;
        } else if (res.ok) {
          setData(body as PolledRun);
          final = isFinalStatus((body as PolledRun).run.status);
        }
      } catch {
        // offline or a restart in between: try again on the next tick
      }
      if (!stopped && !final) timer = setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  return { data, refused };
}
