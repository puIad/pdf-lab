-- Migration 22: Google Docs connection (Phase 5 Part 5.4, PRD §46).

-- One encrypted Google refresh token per person (drive.file scope only). AES-256-GCM through
-- lib/keys/crypto.ts, bound to (user_id, 'google-drive'); the secret is KEY_VAULT_SECRET.
-- Reconnecting replaces the row; disconnecting deletes it.
create table user_google_tokens (
  user_id uuid primary key references users(id) on delete cascade,
  ciphertext text not null,
  created_at timestamptz not null default now()
);

-- Service-role only, like user_provider_keys: no grant and no policy.
alter table user_google_tokens enable row level security;
revoke all on user_google_tokens from anon, authenticated;
