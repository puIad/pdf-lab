// lib/sources/registry.ts — adapter lookup by key, used by pipeline only.
// Per docs/08-ADAPTERS.md: no source-specific imports outside `lib/sources/*`;
// pipeline code talks to these helpers, never to an adapter module directly.

import type { SourceAdapter } from "./types.ts";

const adapters = new Map<string, SourceAdapter>();

export function registerAdapter(adapter: SourceAdapter): void {
  if (adapters.has(adapter.key)) {
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
