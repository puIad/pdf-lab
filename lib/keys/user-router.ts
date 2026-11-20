// lib/keys/user-router.ts: the router for one request (Part 5.2). It runs the person's own keys
// first, falls back to the hosted providers, writes every call to the usage ledger, and marks a key
// revoked when its provider refuses it. Pure over its stores; lib/keys/server.ts binds the database.

import { createRouter, type AIRouter, type ByokKey } from "../ai/index.ts";
import { makeMeter, type LedgerStore, type MeterContext } from "../usage/ledger.ts";
import { activeKeys, markRevoked, parseProvider, type KeyStore } from "./vault.ts";

export interface UserRouter {
  router: AIRouter;
  /** Set `runId` as soon as the run exists so its calls are filed under it. */
  context: MeterContext;
  /** Providers whose keys this request runs on first (empty: hosted quota only). */
  byokProviders: string[];
}

export async function createUserRouter(deps: {
  userId: string | null;
  keys: KeyStore;
  ledger: LedgerStore;
  /** Returns the vault secret; throws when it is not configured (then only hosted runs). */
  secret: () => Buffer;
  env?: NodeJS.ProcessEnv;
}): Promise<UserRouter> {
  const context: MeterContext = { runId: null };
  let byok: ByokKey[] = [];
  if (deps.userId) {
    try {
      byok = await activeKeys(deps.keys, deps.secret(), deps.userId);
    } catch (err) {
      // Vault not configured or unreachable: run on the hosted quota rather than fail the request.
      console.error("provider keys unavailable, using the hosted quota:", err instanceof Error ? err.message : err);
    }
  }
  const userId = deps.userId;
  const router = createRouter(
    deps.env,
    {
      onCall: makeMeter(deps.ledger, userId, context),
      onKeyRefused: async (provider, detail) => {
        if (userId) await markRevoked(deps.keys, userId, parseProvider(provider), detail);
      },
    },
    byok,
  );
  return { router, context, byokProviders: byok.map((k) => k.provider) };
}
