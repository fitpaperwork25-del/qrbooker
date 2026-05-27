-- booking_rls.sql
-- Allow unauthenticated (anon) users to INSERT appointments via the
-- public /book/:slug page.  Owners still read/update/delete via the
-- existing "owner can manage appointments" policy.
--
-- Run in: https://supabase.com/dashboard/project/ejxjizxftlhdpgvpyrnb/sql/new

drop policy if exists "public can book appointments" on appointments;

create policy "public can book appointments"
  on appointments for insert
  with check (
    business_id in (select id from businesses)
  );
