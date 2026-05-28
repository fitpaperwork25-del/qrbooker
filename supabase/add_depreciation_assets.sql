-- Migration: add depreciation_assets table
-- Run in Supabase SQL editor (project ejxjizxftlhdpgvpyrnb)

create table if not exists depreciation_assets (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  purchase_price numeric(10, 2) not null check (purchase_price > 0),
  purchase_date  date not null,
  useful_life    integer not null check (useful_life > 0),
  created_at     timestamptz not null default now()
);

create index if not exists idx_depreciation_business on depreciation_assets(business_id);

alter table depreciation_assets enable row level security;

create policy "owner can manage depreciation assets"
  on depreciation_assets for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
