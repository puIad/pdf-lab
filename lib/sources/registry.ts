// lib/sources/registry.ts — adapter lookup by key, used by pipeline only.
// Per docs/ADAPTERS.md: no source-specific imports outside `lib/sources/*`;
// pipeline code talks to these helpers, never to an adapter module directly.

import type { SourceAdapter } from "./types.ts";

const adapters = new Map<string, SourceAdapter>();

export function registerAdapter(adapter: SourceAdapter): void {
  // Under `next dev`, saving an adapter file runs its module again while this map survives, so
  // the same key arrives twice: the new code replaces the old (issue #53). Anywhere else a second
  // registration is two adapters claiming one key, which is a bug.
  if (adapters.has(adapter.key) && process.env.NODE_ENV !== "development") {
    throw new Error(`SourceAdapter already registered for key '${adapter.key}'`);
  }
  adapters.set(adapter.key, adapter);
}

export function getAdapter(key: string): SourceAdapter | undefined {
  return adapters.get(key);
}

export function listAdapters(): SourceAdapter[] {
  return [...adapters.values()];
}

export function adapterKeys(): string[] {
  return [...adapters.keys()];
}
