-- Embedded wallet layer. Adds one wallet per (user, chain, network) and an
-- application-level transaction log that is reconciled against the network.
-- Safe to run more than once.

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  chain text not null check (chain in ('stellar', 'evm')),
  network text not null,
  provider text not null,
  address text not null,
  provider_wallet_id text,
  status text not null default 'active'
    check (status in ('pending', 'active', 'failed', 'disabled')),
  -- Envelope-encrypted signing material. NULL for provider-managed wallets,
  -- whose keys never leave the provider. Never plaintext, never returned by an
  -- API route and never logged.
  enc_secret text,
  enc_iv text,
  enc_tag text,
  key_version int not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  balance_synced_at timestamptz,
  -- A user has exactly one wallet per chain+network. This is what makes
  -- provisioning idempotent and keeps the address stable across sessions.
  unique (user_id, chain, network)
);

create index if not exists wallets_user_idx on wallets (user_id);

-- An address belongs to one wallet per chain+network.
create unique index if not exists wallets_address_idx
  on wallets (chain, network, lower(address));

-- Provider-managed wallets are identified by the provider's own id.
create unique index if not exists wallets_provider_id_idx
  on wallets (provider, provider_wallet_id) where provider_wallet_id is not null;

create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade,
  chain text not null check (chain in ('stellar', 'evm')),
  network text not null,
  direction text not null check (direction in ('in', 'out')),
  type text not null check (type in ('send', 'receive', 'fund', 'activate')),
  asset text not null,
  amount numeric(38, 18) not null,
  fee numeric(38, 18),
  sender_address text,
  recipient_address text,
  counterparty text,
  tx_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'unknown')),
  ledger bigint,
  explorer_url text,
  error text,
  idempotency_key text,
  reconcile_attempts int not null default 0,
  created_at timestamptz not null default now(),
  status_synced_at timestamptz
);

alter table wallet_transactions
  add column if not exists reconcile_attempts int not null default 0;

create index if not exists wallet_transactions_user_idx
  on wallet_transactions (user_id, created_at desc);

create index if not exists wallet_transactions_wallet_idx
  on wallet_transactions (wallet_id, created_at desc);

-- One row per broadcast transaction, so a retry can be reconciled instead of
-- submitting a second payment.
create unique index if not exists wallet_transactions_hash_idx
  on wallet_transactions (wallet_id, lower(tx_hash)) where tx_hash is not null;

-- Replay protection for client-initiated payments.
create unique index if not exists wallet_transactions_idem_idx
  on wallet_transactions (user_id, idempotency_key) where idempotency_key is not null;
