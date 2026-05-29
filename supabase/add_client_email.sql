-- add_client_email.sql
-- Adds email and reminder-tracking columns to appointments.
-- Safe to run multiple times (idempotent).
-- Run in: https://supabase.com/dashboard/project/ejxjizxftlhdpgvpyrnb/sql/new

alter table appointments add column if not exists client_email       text;
alter table appointments add column if not exists reminder_24h_sent  boolean not null default false;
alter table appointments add column if not exists reminder_2h_sent   boolean not null default false;

create index if not exists idx_appointments_email on appointments(client_email)
  where client_email is not null;
