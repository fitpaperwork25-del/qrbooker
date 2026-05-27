-- fix_appointments_schema.sql
-- Idempotent migration for appointments + blocked_times.
-- Safe to run on a project that already has these tables (full or partial).
-- Run in: https://supabase.com/dashboard/project/ejxjizxftlhdpgvpyrnb/sql/new

-- ============================================================
-- appointments
-- ============================================================

-- Create the table if it has never been created.
create table if not exists appointments (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  location_id  uuid references locations(id) on delete set null,
  client_name  text not null,
  client_phone text,
  service_id   uuid references menu_items(id) on delete set null,
  service_name text,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  status       text not null default 'booked'
               check (status in ('booked', 'confirmed', 'done', 'cancelled', 'no_show')),
  notes        text,
  created_at   timestamptz not null default now()
);

-- Add any nullable columns that may be absent in an older table revision.
-- These are all the columns AppointmentCalendar.tsx selects or inserts.
alter table appointments add column if not exists location_id  uuid references locations(id) on delete set null;
alter table appointments add column if not exists client_phone text;
alter table appointments add column if not exists service_id   uuid references menu_items(id) on delete set null;
alter table appointments add column if not exists service_name text;
alter table appointments add column if not exists notes        text;

-- Ensure indexes exist (no-ops if already present).
create index if not exists idx_appointments_business   on appointments(business_id);
create index if not exists idx_appointments_location   on appointments(location_id);
create index if not exists idx_appointments_start_time on appointments(start_time);

-- RLS
alter table appointments enable row level security;

drop policy if exists "owner can manage appointments" on appointments;
create policy "owner can manage appointments"
  on appointments for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));

-- ============================================================
-- blocked_times
-- ============================================================

create table if not exists blocked_times (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references businesses(id) on delete cascade,
  location_id  uuid references locations(id) on delete cascade,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  reason       text,
  created_at   timestamptz not null default now()
);

-- Add any nullable columns that may be absent in an older table revision.
alter table blocked_times add column if not exists location_id uuid references locations(id) on delete cascade;
alter table blocked_times add column if not exists reason      text;

create index if not exists idx_blocked_times_business on blocked_times(business_id);
create index if not exists idx_blocked_times_location on blocked_times(location_id);
create index if not exists idx_blocked_times_start    on blocked_times(start_time);

alter table blocked_times enable row level security;

drop policy if exists "owner can manage blocked times" on blocked_times;
create policy "owner can manage blocked times"
  on blocked_times for all
  using (business_id in (select id from businesses where owner_id = auth.uid()));
