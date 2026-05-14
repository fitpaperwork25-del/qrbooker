-- Add cancel_reason column to orders
-- Run this once in the Supabase SQL editor before deploying the frontend changes.
alter table orders add column if not exists cancel_reason text;
