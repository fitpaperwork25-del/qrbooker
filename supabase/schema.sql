-- QRServe v3 — Database Schema
-- Generated from ARCHITECTURE.md
-- Run this in the Supabase SQL editor against project pzpgjyuvtmjetvpyavnt

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- businesses
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

-- ============================================================
-- locations
-- Tables, seats, rooms — one QR code per location row.
-- ============================================================
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

-- ============================================================
-- menu_categories
-- ============================================================
create table if not exists menu_categories (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  display_order  integer not null default 0,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- menu_items
-- ============================================================
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

-- ============================================================
-- orders
-- NOTE: revenue queries must filter by location_id IN
--   (select id from locations where business_id = ?)
-- Do NOT rely on business_id alone — it is a denorm convenience.
-- ============================================================
create table if not exists orders (
  id           uuid primary key default uuid_generate_v4(),
  location_id  uuid not null references locations(id) on delete restrict,
  business_id  uuid not null references businesses(id) on delete restrict,
  total        numeric(10, 2) not null default 0,
  status       text not null default 'new' check (status in ('new', 'preparing', 'ready', 'done', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- order_items
-- ============================================================
create table if not exists order_items (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id) on delete restrict,
  quantity      integer not null default 1 check (quantity > 0),
  unit_price    numeric(10, 2) not null default 0,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- business_expenses
-- NOTE: date column is expense_date (not "date")
-- ============================================================
create table if not exists business_expenses (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  amount        numeric(10, 2) not null,
  category      text not null,
  description   text,
  expense_date  date not null,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- manual_revenue
-- Owner-entered revenue not captured via orders (cash, catering, etc.)
-- ============================================================
create table if not exists manual_revenue (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  amount        numeric(10, 2) not null,
  category      text not null check (category in ('Dine-in', 'Takeout', 'Catering', 'Other')),
  description   text,
  revenue_date  date not null,
  created_at    timestamptz not null default now()
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
create index if not exists idx_manual_revenue_date     on manual_revenue(revenue_date);

-- ============================================================
-- updated_at trigger for orders
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

-- businesses
create policy "owner can manage own business"
  on businesses for all
  using (owner_id = auth.uid());

-- locations
create policy "owner can manage locations"
  on locations for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "public can read active locations"
  on locations for select
  using (is_active = true);

-- menu_categories
create policy "owner can manage menu categories"
  on menu_categories for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "public can read visible categories"
  on menu_categories for select
  using (is_visible = true);

-- menu_items
create policy "owner can manage menu items"
  on menu_items for all
  using (
    category_id in (
      select mc.id from menu_categories mc
      join businesses b on b.id = mc.business_id
      where b.owner_id = auth.uid()
    )
  );

create policy "public can read available items"
  on menu_items for select
  using (is_available = true);

-- orders: owner full access, customers can insert
create policy "owner can manage orders"
  on orders for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "public can place orders"
  on orders for insert
  with check (true);

-- order_items: owner can read, customers can insert
create policy "owner can read order items"
  on order_items for select
  using (
    order_id in (
      select o.id from orders o
      join businesses b on b.id = o.business_id
      where b.owner_id = auth.uid()
    )
  );

create policy "public can insert order items"
  on order_items for insert
  with check (true);

-- business_expenses: owner only
create policy "owner can manage expenses"
  on business_expenses for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- manual_revenue: owner only
alter table manual_revenue enable row level security;

create policy "owner can manage manual revenue"
  on manual_revenue for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
