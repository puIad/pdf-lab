// lib/keys/crypto.ts: AES-256-GCM for provider keys at rest (Part 5.2, PRD §34).
// The secret is KEY_VAULT_SECRET (32 random bytes, base64) and lives only in the server environment.
// Each value is bound to its (user, provider) through the GCM additional data, so a ciphertext
// copied to another row does not decrypt. Format: v1.<iv>.<tag>.<data>, all base64url.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function vaultSecret(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.KEY_VAULT_SECRET;
  if (!raw) throw new Error("KEY_VAULT_SECRET is not set: provider keys cannot be stored or read.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("KEY_VAULT_SECRET must be 32 bytes, base64 encoded (openssl rand -base64 32).");
  return key;
}

const aad = (userId: string, provider: string) => Buffer.from(`${userId}:${provider}`);

export function encryptKey(secret: Buffer, userId: string, provider: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(aad(userId, provider));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptKey(secret: Buffer, userId: string, provider: string, ciphertext: string): string {
  const [version, iv, tag, data] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("unknown key format");
  const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(userId, provider));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
