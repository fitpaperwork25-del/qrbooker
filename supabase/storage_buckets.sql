-- QRBooker Storage Buckets — idempotent
-- Run in: https://supabase.com/dashboard/project/ejxjizxftlhdpgvpyrnb/sql/new

-- ============================================================
-- Buckets (public = true enables public URL access)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('menu-images',     'menu-images',     true),
  ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ============================================================
-- Public read policies
-- ============================================================
DROP POLICY IF EXISTS "public read menu-images"     ON storage.objects;
DROP POLICY IF EXISTS "public read business-assets" ON storage.objects;

CREATE POLICY "public read menu-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "public read business-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-assets');

-- ============================================================
-- Authenticated upload / delete (owners only)
-- ============================================================
DROP POLICY IF EXISTS "authenticated upload menu-images"     ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload business-assets" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete menu-images"     ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete business-assets" ON storage.objects;

CREATE POLICY "authenticated upload menu-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images' AND auth.role() = 'authenticated');

CREATE POLICY "authenticated upload business-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-assets' AND auth.role() = 'authenticated');

CREATE POLICY "authenticated delete menu-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'menu-images' AND auth.role() = 'authenticated');

CREATE POLICY "authenticated delete business-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'business-assets' AND auth.role() = 'authenticated');
