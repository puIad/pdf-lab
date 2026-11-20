// lib/billing/stub.ts: the premium checkout stub (Part 5.3). An entitled plan flips the limits and
// the change is logged. No payment provider exists here (Stripe or Paddle is a separate decision),
// so no real charge is possible: BILLING_MODE is a constant, `charge` always throws, and a plan
// change row can only carry charged_cents = 0 (also a check constraint in the database).

export type PlanName = "free" | "premium";
export const BILLING_MODE = "stub" as const;

export interface PlanChange {
  userId: string;
  fromPlan: PlanName;
  toPlan: PlanName;
  source: typeof BILLING_MODE;
  chargedCents: 0;
}

export interface BillingStore {
  currentPlan(userId: string): Promise<PlanName>;
  /** Sets the plan and logs the change. */
  apply(change: PlanChange): Promise<void>;
}

/** The only money path. There is no provider behind it in stub mode. */
export function charge(): never {
  throw new Error("Billing is in stub mode: no payment provider is connected, so nothing can be charged.");
}

/** The stub is open on dev servers, and in production only when BILLING_STUB_ENABLED=1. */
export function stubAllowed(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production" || env.BILLING_STUB_ENABLED === "1";
}

export async function changePlan(store: BillingStore, userId: string, toPlan: PlanName): Promise<PlanChange | null> {
  if ((BILLING_MODE as string) !== "stub") charge(); // guards a future edit of the constant
  const fromPlan = await store.currentPlan(userId);
  if (fromPlan === toPlan) return null;
  const change: PlanChange = { userId, fromPlan, toPlan, source: BILLING_MODE, chargedCents: 0 };
  await store.apply(change);
  return change;
}
