// lib/keys/vault.ts: a person's own provider keys: save, rotate, delete, list, and hand them to the
// router (Part 5.2, Mode 2 of PRD §34). Pure over a KeyStore, so the rules are tested without a database.
// A key is never logged and never returned: the list shows the last 4 characters and the status.

import { decryptKey, encryptKey } from "./crypto.ts";

export const BYOK_PROVIDERS = ["gemini", "openai-compatible", "bedrock", "openrouter"] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<ByokProvider, string> = {
  gemini: "Google Gemini",
  "openai-compatible": "OpenAI or compatible",
  bedrock: "Amazon Bedrock",
  openrouter: "OpenRouter",
};

/** Non-secret settings stored beside the key. */
export interface KeyOptions {
  /** OpenAI-compatible only: the endpoint, https. Default is OpenAI's. */
  baseUrl?: string;
  /** Bedrock only: AWS region of the key. Default us-east-1. */
  region?: string;
  /** The chat model to use with this key. Required for Bedrock; optional elsewhere. */
  model?: string;
}

export interface KeyRow {
  userId: string;
  provider: ByokProvider;
  ciphertext: string;
  last4: string;
  options: KeyOptions;
  status: "active" | "revoked";
  statusDetail: string | null;
  createdAt: string;
  rotatedAt: string | null;
}

/** What the person (and the client) may see of a key. Never the key. */
export interface KeyView {
  provider: ByokProvider;
  label: string;
  last4: string;
  options: KeyOptions;
  status: "active" | "revoked";
  statusDetail: string | null;
  createdAt: string;
  rotatedAt: string | null;
}

export interface KeyStore {
  get(userId: string, provider: ByokProvider): Promise<KeyRow | null>;
  list(userId: string): Promise<KeyRow[]>;
  /** Insert or replace the row for (userId, provider). */
  put(row: KeyRow): Promise<void>;
  remove(userId: string, provider: ByokProvider): Promise<boolean>;
  setStatus(userId: string, provider: ByokProvider, status: "active" | "revoked", detail: string | null): Promise<void>;
}

/** A key that decrypted, ready for the router. Lives in memory for one request. */
export interface ActiveKey {
  provider: ByokProvider;
  apiKey: string;
  options: KeyOptions;
}

export class KeyInputError extends Error {}

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.internal|.*\.local|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

// shortcut: only the typed hostname is checked. DNS is not resolved, so a public name that points at a
// private address (e.g. 127.0.0.1.nip.io) passes; redirects are blocked in lib/ai/index.ts. Resolve and
// pin the address if the app ever runs on a host with an internal network.
/** An endpoint the server will call with the person's key: https, and not an address inside our network. */
export function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new KeyInputError("baseUrl must be a full https URL");
  }
  if (url.protocol !== "https:") throw new KeyInputError("baseUrl must use https");
  if (url.username || url.password) throw new KeyInputError("baseUrl must not carry credentials");
  if (PRIVATE_HOST.test(url.hostname)) throw new KeyInputError("baseUrl must be a public host");
  return url.toString().replace(/\/+$/, "");
}

export function parseProvider(value: unknown): ByokProvider {
  if (typeof value === "string" && (BYOK_PROVIDERS as readonly string[]).includes(value)) return value as ByokProvider;
  throw new KeyInputError(`provider must be one of: ${BYOK_PROVIDERS.join(", ")}`);
}

function cleanOptions(provider: ByokProvider, raw: KeyOptions | undefined): KeyOptions {
  const out: KeyOptions = {};
  const model = typeof raw?.model === "string" ? raw.model.trim() : "";
  if (model) {
    if (model.length > 200 || /\s/.test(model)) throw new KeyInputError("model must be a model id without spaces");
    out.model = model;
  }
  if (provider === "openai-compatible" && typeof raw?.baseUrl === "string" && raw.baseUrl.trim()) {
    out.baseUrl = validateBaseUrl(raw.baseUrl.trim());
  }
  if (provider === "bedrock") {
    const region = (typeof raw?.region === "string" && raw.region.trim()) || "us-east-1";
    if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) throw new KeyInputError("region must look like us-east-1");
    out.region = region;
    if (!out.model) throw new KeyInputError("Bedrock needs a model id your key may call");
  }
  return out;
}

export function toView(row: KeyRow): KeyView {
  return {
    provider: row.provider,
    label: PROVIDER_LABEL[row.provider],
    last4: row.last4,
    options: row.options,
    status: row.status,
    statusDetail: row.statusDetail,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
  };
}

/** Saves a key. Saving over an existing one is a rotation: the old value is gone and the status is active again. */
export async function saveKey(
  store: KeyStore,
  secret: Buffer,
  input: { userId: string; provider: unknown; apiKey: unknown; options?: KeyOptions },
  now: () => Date = () => new Date(),
): Promise<KeyView> {
  const provider = parseProvider(input.provider);
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new KeyInputError("apiKey must be 8 to 512 characters with no spaces");
  }
  const options = cleanOptions(provider, input.options);
  const existing = await store.get(input.userId, provider);
  const at = now().toISOString();
  const row: KeyRow = {
    userId: input.userId,
    provider,
    ciphertext: encryptKey(secret, input.userId, provider, apiKey),
    last4: apiKey.slice(-4),
    options,
    status: "active",
    statusDetail: null,
    createdAt: existing?.createdAt ?? at,
    rotatedAt: existing ? at : null,
  };
  await store.put(row);
  return toView(row);
}

export async function deleteKey(store: KeyStore, userId: string, provider: unknown): Promise<boolean> {
  return store.remove(userId, parseProvider(provider));
}

export async function listKeys(store: KeyStore, userId: string): Promise<KeyView[]> {
  return (await store.list(userId)).map(toView);
}

/** The person's active keys, decrypted. A key that no longer decrypts is skipped, never thrown over. */
export async function activeKeys(store: KeyStore, secret: Buffer, userId: string): Promise<ActiveKey[]> {
  const out: ActiveKey[] = [];
  for (const row of await store.list(userId)) {
    if (row.status !== "active") continue;
    try {
      out.push({ provider: row.provider, apiKey: decryptKey(secret, userId, row.provider, row.ciphertext), options: row.options });
    } catch {
      console.error(`provider key for ${row.provider} could not be decrypted; it is skipped`);
    }
  }
  return out;
}

export async function markRevoked(store: KeyStore, userId: string, provider: ByokProvider, detail: string): Promise<void> {
  await store.setStatus(userId, provider, "revoked", detail.slice(0, 300));
}
