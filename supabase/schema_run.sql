-- QRBooker — Safe Schema Run (idempotent)
-- Target project: ejxjizxftlhdpgvpyrnb
-- Safe to run on a project that already has some tables / policies.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- Tables (all IF NOT EXISTS — no-ops if already present)
-- ============================================================
create table if not exists businesses (
  id                      uuid primary key default uuid_generate_v4(),
  owner_id                uuid not null references auth.users(id) on delete cascade,
  name                    text not null,
  slug                    text not null unique,
  type                    text not null check (type in ('restaurant', 'cafe', 'barbershop', 'salon', 'hotel')),
  plan                    text not null default 'starter' check (plan in ('starter', 'pro', 'enterprise')),
  subscription_status     text not null default 'trialing' check (subscription_status in ('active', 'trialing', 'expired', 'cancelled', 'past_due')),
  staff_pin               text,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  logo_url                text,
  hero_image_url          text,
  tagline                 text,
  accent                  text,
  created_at              timestamptz not null default now()
);

create table if not exists locations (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  label        text,
  slug         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (business_id, slug)
);

create table if not exists menu_categories (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  display_order  integer not null default 0,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists menu_items (
  id             uuid primary key default uuid_generate_v4(),
  category_id    uuid not null references menu_categories(id) on delete cascade,
  name           text not null,
  price          numeric(10, 2) not null default 0,
  description    text,
  image_url      text,
  is_available   boolean not null default true,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists orders (
  id           uuid primary key default uuid_generate_v4(),
  location_id  uuid not null references locations(id) on delete restrict,
  business_id  uuid not null references businesses(id) on delete restrict,
  total        numeric(10, 2) not null default 0,
  status       text not null default 'new' check (status in ('new', 'preparing', 'ready', 'done', 'cancelled')),
  cancel_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Add cancel_reason to orders if it was created without it
alter table orders add column if not exists cancel_reason text;

create table if not exists order_items (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id) on delete restrict,
  quantity      integer not null default 1 check (quantity > 0),
  unit_price    numeric(10, 2) not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists business_expenses (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  amount        numeric(10, 2) not null,
  category      text not null,
  description   text,
  expense_date  date not null,
  created_at    timestamptz not null default now()
);

-- manual_revenue — category is free text (no check constraint)
create table if not exists manual_revenue (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  amount        numeric(10, 2) not null,
  category      text not null,
  description   text,
  date          date not null,
  created_at    timestamptz not null default now()
);

-- Drop the old restricted-category constraint if it exists on an already-created table
alter table manual_revenue
  drop constraint if exists manual_revenue_category_check;

-- tabs (open-tab tracking used by appointments view)
create table if not exists tabs (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  location_id  uuid references locations(id) on delete set null,
  status       text not null default 'open' check (status in ('open', 'closed')),
  total        numeric(10, 2) not null default 0,
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_businesses_owner        on businesses(owner_id);
create index if not exists idx_locations_business      on locations(business_id);
create index if not exists idx_menu_categories_biz     on menu_categories(business_id);
create index if not exists idx_menu_items_category     on menu_items(category_id);
create index if not exists idx_orders_business         on orders(business_id);
create index if not exists idx_orders_location         on orders(location_id);
create index if not exists idx_orders_status           on orders(status);
create index if not exists idx_order_items_order       on order_items(order_id);
create index if not exists idx_expenses_business       on business_expenses(business_id);
create index if not exists idx_expenses_date           on business_expenses(expense_date);
create index if not exists idx_manual_revenue_business on manual_revenue(business_id);
create index if not exists idx_manual_date             on manual_revenue(date);
create index if not exists idx_tabs_business           on tabs(business_id);
create index if not exists idx_tabs_status             on tabs(status);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row execute procedure set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table businesses        enable row level security;
alter table locations         enable row level security;
alter table menu_categories   enable row level security;
alter table menu_items        enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;
alter table business_expenses enable row level security;
alter table manual_revenue    enable row level security;
alter table tabs              enable row level security;

-- ============================================================
-- Policies — drop first so re-runs don't error
-- ============================================================

-- businesses
drop policy if exists "owner can manage own business" on businesses;
create policy "owner can manage own business"
  on businesses for all
  using (owner_id = auth.uid());

-- locations
drop policy if exists "owner can manage locations" on locations;
create policy "owner can manage locations"
  on locations for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

drop policy if exists "public can read active locations" on locations;
create policy "public can read active locations"
  on locations for select
  using (is_active = true);

-- menu_categories
drop policy if exists "owner can manage menu categories" on menu_categories;
create policy "owner can manage menu categories"
  on menu_categories for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

drop policy if exists "public can read visible categories" on menu_categories;
create policy "public can read visible categories"
  on menu_categories for select
  using (is_visible = true);

-- menu_items
drop policy if exists "owner can manage menu items" on menu_items;
create policy "owner can manage menu items"
  on menu_items for all
  using (
    category_id in (
      select mc.id from menu_categories mc
      join businesses b on b.id = mc.business_id
      where b.owner_id = auth.uid()
    )
  );

drop policy if exists "public can read available items" on menu_items;
create policy "public can read available items"
  on menu_items for select
  using (is_available = true);

-- orders
drop policy if exists "owner can manage orders" on orders;
create policy "owner can manage orders"
  on orders for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

drop policy if exists "public can place orders" on orders;
create policy "public can place orders"
  on orders for insert
  with check (true);

-- order_items
drop policy if exists "owner can read order items" on order_items;
create policy "owner can read order items"
  on order_items for select
  using (
    order_id in (
      select o.id from orders o
      join businesses b on b.id = o.business_id
      where b.owner_id = auth.uid()
    )
  );

drop policy if exists "public can insert order items" on order_items;
create policy "public can insert order items"
  on order_items for insert
  with check (true);

-- business_expenses
drop policy if exists "owner can manage expenses" on business_expenses;
create policy "owner can manage expenses"
  on business_expenses for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- manual_revenue
drop policy if exists "owner can manage manual revenue" on manual_revenue;
create policy "owner can manage manual revenue"
  on manual_revenue for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- tabs
drop policy if exists "owner can manage tabs" on tabs;
create policy "owner can manage tabs"
  on tabs for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

drop policy if exists "public can read tabs" on tabs;
create policy "public can read tabs"
  on tabs for select
  using (true);
