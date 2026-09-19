// lib/runs/lifecycle.ts — Lifecycle state machine and trace tracker per docs/05-PIPELINE-SCORING.md.

import type { LifecycleState, LifecycleTraceStep } from "./types.ts";
import { LIFECYCLE_STATES } from "./types.ts";

/**
 * Validates whether transition from `from` state to `to` state is legal.
 * Transitions must move forward in the state sequence, or jump to "failed".
 */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (to === "failed") return true;
  if (from === "failed" || from === "completed") return false;

  const fromIdx = LIFECYCLE_STATES.indexOf(from as (typeof LIFECYCLE_STATES)[number]);
  const toIdx = LIFECYCLE_STATES.indexOf(to as (typeof LIFECYCLE_STATES)[number]);

  if (fromIdx === -1 || toIdx === -1) return false;
  // Must transition to next sequential state or forward
  return toIdx > fromIdx;
}

export class LifecycleTracker {
  private steps: LifecycleTraceStep[] = [];
  private currentState: LifecycleState = "queued";
  private lastStateTime: number = Date.now();

  constructor(initialState: LifecycleState = "queued", initialMessage?: string) {
    this.currentState = initialState;
    this.lastStateTime = Date.now();
    this.steps.push({
      state: initialState,
      timestamp: new Date().toISOString(),
      message: initialMessage || `Run entered ${initialState}`,
    });
  }

  getCurrentState(): LifecycleState {
    return this.currentState;
  }

  transition(
    nextState: LifecycleState,
    options?: { counts?: Record<string, number>; message?: string },
  ): LifecycleTraceStep {
    if (!isValidTransition(this.currentState, nextState)) {
      throw new Error(
        `Illegal lifecycle transition: cannot move from "${this.currentState}" to "${nextState}"`,
      );
    }

    const now = Date.now();
    const durationMs = now - this.lastStateTime;
    this.lastStateTime = now;
    this.currentState = nextState;

    const step: LifecycleTraceStep = {
      state: nextState,
      timestamp: new Date().toISOString(),
      durationMs,
      counts: options?.counts,
      message: options?.message || `Run moved to ${nextState}`,
    };

    this.steps.push(step);
    return step;
  }

  getTrace(): LifecycleTraceStep[] {
    return [...this.steps];
  }
}
