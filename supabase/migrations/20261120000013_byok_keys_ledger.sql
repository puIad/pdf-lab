-- Migration 13: BYOK key vault and AI usage ledger (Phase 5 Part 5.2, PRD §34).

-- One encrypted provider key per person and provider. Saving over a row is a rotation.
-- The ciphertext is AES-256-GCM (lib/keys/crypto.ts), bound to (user_id, provider); the secret that
-- decrypts it lives only in the server environment (KEY_VAULT_SECRET), never in the database.
create table user_provider_keys (
  user_id uuid references users(id) on delete cascade not null,
  provider text not null check (provider in ('gemini', 'openai-compatible', 'bedrock', 'openrouter')),
  ciphertext text not null,
  last4 text not null check (char_length(last4) = 4),       -- shown so a person can tell keys apart
  options jsonb not null default '{}'::jsonb,                -- non-secret: baseUrl, region, model
  status text not null default 'active' check (status in ('active', 'revoked')),
  status_detail text,                                        -- why a key was marked revoked
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  primary key (user_id, provider)
);

-- Service-role only. No grant and no policy: not even the owner can read a row through the API.
alter table user_provider_keys enable row level security;
revoke all on user_provider_keys from anon, authenticated;

-- One row per metered model call (embeddings included). key_source says who paid: the person's own
-- key ('byok') or the hosted quota ('hosted'). run_id is null for a call outside a run.
create table ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  run_id uuid references research_runs(id) on delete set null,
  provider text not null,
  model text not null,
  tier text not null check (tier in ('cheap', 'strong', 'embed')),
  key_source text not null check (key_source in ('byok', 'hosted')),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  cost_basis text not null check (cost_basis in ('reported', 'table', 'unpriced')),
  created_at timestamptz not null default now()
);
create index on ai_usage_ledger (user_id, created_at);
create index on ai_usage_ledger (run_id);

alter table ai_usage_ledger enable row level security;
revoke all on ai_usage_ledger from anon, authenticated;
grant select on ai_usage_ledger to authenticated;
create policy "owner reads own ledger"
  on ai_usage_ledger for select to authenticated using ((select auth.uid()) = user_id);
