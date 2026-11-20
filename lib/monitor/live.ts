// lib/monitor/live.ts: the production wiring of the monitor cron (Part 4.2). Server-only.

import { start } from "workflow/api";
import { monitorRunWorkflow } from "../../workflows/monitor-run.ts";
import { getServiceDeps } from "../ingest/service-deps.ts";
import { runIngest } from "../ingest/pipeline.ts";
import { autocompleteEnabled } from "../sources/index.ts";
import { scanSourceKeys } from "../ideas/seeds.ts";
import { createRunFrame } from "../runs/orchestrator.ts";
import { createServerOrchestratorDeps } from "../runs/service-deps.ts";
import type { DeepRunInput } from "../runs/deep-steps.ts";
import type { MarketSignal } from "../sources/types.ts";
import type { CronDeps } from "./cron.ts";

/** The same scan POST /api/ideas runs, returning the signals it stored. */
export async function scanSeedLive(seed: string, region: string): Promise<MarketSignal[]> {
  const stored: MarketSignal[] = [];
  await runIngest({ query: seed, limit: 50, sourceKeys: scanSourceKeys(autocompleteEnabled() ? "autocomplete" : "web"), geo: region }, getServiceDeps(), (_k, s) => stored.push(...s));
  return stored;
}

/** Creates a monitor run row and starts its workflow. Mode `monitor` never replaces a Deep run (lib/runs/scope.ts lists `deep` only). */
export async function startMarketRunLive(seed: string): Promise<string> {
  const frame = await createRunFrame({ query: seed, seed, mode: "monitor", limit: 25, userId: null }, createServerOrchestratorDeps());
  const input: DeepRunInput = { runId: frame.runId, query: frame.query, seed: frame.seed, mode: "monitor", startedAt: frame.startedAt, limit: 25, userId: null, kind: "model" };
  await start(monitorRunWorkflow, [input]);
  return frame.runId;
}

export const liveCronDeps = (store: CronDeps["store"], force = false): CronDeps => ({ store, scan: scanSeedLive, startMarketRun: startMarketRunLive, force });
