-- Migration: add owner_draws table
-- Run in Supabase SQL editor (project ejxjizxftlhdpgvpyrnb)

create table if not exists owner_draws (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  amount       numeric(10, 2) not null check (amount >= 0),
  description  text,
  draw_date    date not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_owner_draws_business on owner_draws(business_id);
create index if not exists idx_owner_draws_date     on owner_draws(draw_date);

alter table owner_draws enable row level security;

create policy "owner can manage draws"
  on owner_draws for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
