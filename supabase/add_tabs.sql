-- QRServe v3 — Comprehensive migration
-- Run once in the Supabase SQL editor. All statements are idempotent.
-- After running, reload the PostgREST schema cache:
--   Supabase Dashboard → API → "Reload schema"

-- ── 1. cancel_reason + cancelled_at on orders ────────────────────
alter table orders add column if not exists cancel_reason  text;
alter table orders add column if not exists cancelled_at   timestamptz;

create or replace function set_cancelled_at()
returns trigger as $$
begin
  if new.status = 'cancelled' and (old.status is null or old.status <> 'cancelled') then
    new.cancelled_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_set_cancelled_at on orders;
create trigger orders_set_cancelled_at
  before update on orders
  for each row execute procedure set_cancelled_at();

-- ── 2. anon UPDATE on orders (staff / scan-page operations) ──────
grant update on orders to anon;

drop policy if exists "staff can update orders" on orders;
create policy "staff can update orders"
  on orders for update
  using (true)
  with check (status in ('new', 'preparing', 'ready', 'done', 'cancelled'));

-- ── 3. tabs table ─────────────────────────────────────────────────
create table if not exists tabs (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete restrict,
  location_id uuid not null references locations(id)  on delete restrict,
  name        text,
  status      text not null default 'open'
              check (status in ('open', 'closed')),
  total       numeric(10,2) not null default 0,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tabs_business on tabs(business_id);
create index if not exists idx_tabs_location on tabs(location_id);
create index if not exists idx_tabs_status   on tabs(status);

alter table tabs enable row level security;

drop policy if exists "owner can manage tabs" on tabs;
create policy "owner can manage tabs"
  on tabs for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

drop policy if exists "public can insert tabs" on tabs;
create policy "public can insert tabs"
  on tabs for insert with check (true);

drop policy if exists "public can update tabs" on tabs;
create policy "public can update tabs"
  on tabs for update
  using (true)
  with check (status in ('open', 'closed'));

drop policy if exists "public can read tabs" on tabs;
create policy "public can read tabs"
  on tabs for select using (true);

grant select, insert, update on tabs to anon, authenticated;

-- ── 4. tab_id on orders ───────────────────────────────────────────
alter table orders add column if not exists tab_id uuid references tabs(id);

create index if not exists idx_orders_tab on orders(tab_id);
