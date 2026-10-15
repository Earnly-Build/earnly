-- Account-owned activity. Demo balances and wallet tables are unchanged.
create table if not exists applications (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  opportunity_id text not null,
  stage text not null default 'Applied'
    check (stage in ('Applied', 'Accepted', 'In progress', 'Submitted', 'Completed', 'Paid')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, opportunity_id)
);

create index if not exists applications_user_created_idx
  on applications (user_id, created_at desc, id);

create table if not exists saved_opportunities (
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table if not exists notifications (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  kind text not null
    check (kind in ('application', 'match', 'payment', 'deadline', 'review', 'verification', 'ai')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (user_id, id)
);

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc, id);
