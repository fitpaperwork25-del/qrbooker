-- Migration: add manual_revenue table
-- Run this in Supabase SQL editor (project yizvlbupvamsietgjtys)

create table if not exists manual_revenue (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  amount        numeric(10, 2) not null,
  category      text not null check (category in ('Dine-in', 'Takeout', 'Catering', 'Other')),
  description   text,
  revenue_date  date not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_manual_revenue_business on manual_revenue(business_id);
create index if not exists idx_manual_revenue_date     on manual_revenue(revenue_date);

alter table manual_revenue enable row level security;

create policy "owner can manage manual revenue"
  on manual_revenue for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
