// lib/settings/access.ts — who may change server-wide settings (Part 6.9).

import type { Caller } from "../quotas/quotas.ts";

/**
 * The server key, a dev server, or the signed-in person whose email is OWNER_EMAIL. Nobody else,
 * so a free account cannot spend the owner's provider quota.
 */
export function canManageSettings(caller: Caller, ownerEmail: string | undefined = process.env.OWNER_EMAIL): boolean {
  if (caller.plan === "internal" || caller.plan === "local") return true;
  return Boolean(ownerEmail && caller.email && caller.email.toLowerCase() === ownerEmail.trim().toLowerCase());
}
