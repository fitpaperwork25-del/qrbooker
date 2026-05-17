-- Create storage buckets for menu item images and business branding assets
-- Run this in the Supabase SQL editor for project yizvlbupvamsietgjtys

-- ── Buckets ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('menu-images',      'menu-images',      true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']),
  ('business-assets',  'business-assets',  true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- ── Policies: menu-images ────────────────────────────────────
-- Public read (covered by bucket public=true but explicit policy is safer)
CREATE POLICY "menu_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'menu-images');

-- ── Policies: business-assets ────────────────────────────────
CREATE POLICY "business_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-assets');

CREATE POLICY "business_assets_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'business-assets');

CREATE POLICY "business_assets_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'business-assets');

CREATE POLICY "business_assets_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'business-assets');
