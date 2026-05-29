-- setup_email_notifications.sql
-- Sets up:
--   1. A pg_net trigger that fires the booking-confirmation edge function
--      immediately after each appointment INSERT.
--   2. A pg_cron job that calls the reminder function every hour.
--
-- Prerequisites:
--   • pg_net and pg_cron extensions must be enabled (Database → Extensions).
--   • Edge functions must be deployed (see deployment steps below).
--   • REPLACE <SERVICE_ROLE_KEY> and <CRON_SECRET> with real values.
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
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
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
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);


-- ============================================================
-- Deployment checklist (run once from your terminal)
-- ============================================================
-- 1. Install Supabase CLI:  npm i -g supabase
-- 2. Link project:          supabase link --project-ref ejxjizxftlhdpgvpyrnb
-- 3. Set secrets:
--      supabase secrets set \
--        SENDGRID_API_KEY="<your-sendgrid-key>" \
--        PIERCE_EMAIL="fitpaperwork25@gmail.com" \
--        FROM_EMAIL="noreply@qrbooker.co" \
--        CRON_SECRET="<generate-a-random-secret>" \
--        BUSINESS_TIMEZONE="America/New_York"
-- 4. Deploy functions:
--      supabase functions deploy send-booking-confirmation --no-verify-jwt
--      supabase functions deploy send-appointment-reminders --no-verify-jwt
-- 5. Run add_client_email.sql in the Supabase SQL editor.
-- 6. Replace <SERVICE_ROLE_KEY> and <CRON_SECRET> above, then run this file.
-- ============================================================
