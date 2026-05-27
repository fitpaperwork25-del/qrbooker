-- Migration: add balance_sheet_items table
-- Run in Supabase SQL editor (project ejxjizxftlhdpgvpyrnb)

create table if not exists balance_sheet_items (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  type         text not null check (type in ('asset', 'liability', 'equity')),
  label        text not null,
  amount       numeric(10, 2) not null check (amount >= 0),
  as_of_date   date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_balance_sheet_business on balance_sheet_items(business_id);
create index if not exists idx_balance_sheet_date     on balance_sheet_items(as_of_date);

alter table balance_sheet_items enable row level security;

create policy "owner can manage balance sheet"
  on balance_sheet_items for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
