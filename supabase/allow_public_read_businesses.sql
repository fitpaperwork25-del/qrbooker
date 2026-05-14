-- Allow unauthenticated users to read businesses by slug.
-- Required for staff login: the anon role must be able to look up a business
-- before any session exists. The staff_pin is a 4-digit code and not a secret.
-- Run once in the Supabase SQL editor for project pzpgjyuvtmjetvpyavnt.

create policy "public can read businesses"
  on businesses for select
  using (true);
