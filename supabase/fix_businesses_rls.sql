-- Fix staff login: replace anon-only SELECT policy with a public one.
-- The previous policy was scoped TO anon, so authenticated users (owners
-- logged in on the same browser) got 0 rows and saw "Restaurant not found".
DROP POLICY IF EXISTS "anon can read businesses for staff login" ON businesses;

CREATE POLICY "public can read businesses"
  ON businesses FOR SELECT
  USING (true);
