-- setup_email_notifications.sql
-- Sets up:
--   1. A pg_net trigger that fires the booking-confirmation edge function
--      immediately after each appointment INSERT.
--   2. A pg_cron job that calls the reminder function every hour.
--
-- Prerequisites:
--   • pg_net and pg_cron extensions must be enabled (Database → Extensions).
--   • Edge functions must be deployed and secrets set (see deployment checklist).
--
-- Run in: https://supabase.com/dashboard/project/ejxjizxftlhdpgvpyrnb/sql/new
-- ============================================================

-- ============================================================
-- 1. Confirmation trigger (fires on every appointment INSERT)
-- ============================================================

create or replace function public.trigger_booking_confirmation()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://ejxjizxftlhdpgvpyrnb.supabase.co/functions/v1/send-booking-confirmation',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer QRBooker2026!'
    ),
    body    := jsonb_build_object(
      'type',       'INSERT',
      'table',      'appointments',
      'schema',     'public',
      'record',     row_to_json(NEW)::jsonb,
      'old_record', null::jsonb
    )
  );
  return NEW;
end;
$$;

drop trigger if exists on_appointment_created on appointments;
create trigger on_appointment_created
  after insert on appointments
  for each row
  execute function trigger_booking_confirmation();


-- ============================================================
-- 2. Hourly reminder cron job
-- ============================================================

-- Remove any previous schedule with this name before re-creating
select cron.unschedule('send-appointment-reminders')
  where exists (
    select 1 from cron.job where jobname = 'send-appointment-reminders'
  );

select cron.schedule(
  'send-appointment-reminders',
  '0 * * * *',   -- top of every hour
  $$
  select net.http_post(
    url     := 'https://ejxjizxftlhdpgvpyrnb.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer QRBooker2026!'
    ),
    body    := '{}'::jsonb
  );
  $$
);


-- ============================================================
-- Deployment checklist (already completed)
-- ============================================================
-- 1. npx supabase link --project-ref ejxjizxftlhdpgvpyrnb  ✓
-- 2. npx supabase db query --linked -f supabase/add_client_email.sql  ✓
-- 3. npx supabase secrets set SENDGRID_API_KEY=... PIERCE_EMAIL=... etc.  ✓
-- 4. npx supabase functions deploy send-booking-confirmation --no-verify-jwt  ✓
-- 5. npx supabase functions deploy send-appointment-reminders --no-verify-jwt  ✓
-- 6. Run this file in the Supabase SQL editor  ← you are here
-- ============================================================
