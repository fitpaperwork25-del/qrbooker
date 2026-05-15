-- Admin setup v2 — re-runnable
-- Changes: admin_notes becomes a timestamped log (multi-row),
--          admin_checklist added (qr_printed, staff_trained toggles),
--          get_admin_businesses updated to include staff_pin + checklist,
--          new helper RPCs for PIN reset, checklist toggle, log insert.

-- ── admin_notes (log — multiple rows per business) ────────────────────────────
DROP TABLE IF EXISTS admin_notes CASCADE;
CREATE TABLE admin_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  note        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_biz ON admin_notes(business_id, created_at DESC);
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super admin notes" ON admin_notes;
CREATE POLICY "super admin notes" ON admin_notes FOR ALL
  USING  ((auth.jwt() ->> 'email') = 'fitpaperwork25@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'fitpaperwork25@gmail.com');
GRANT ALL ON admin_notes TO authenticated;

-- ── admin_checklist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_checklist (
  business_id   uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  qr_printed    boolean NOT NULL DEFAULT false,
  staff_trained boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super admin checklist" ON admin_checklist;
CREATE POLICY "super admin checklist" ON admin_checklist FOR ALL
  USING  ((auth.jwt() ->> 'email') = 'fitpaperwork25@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'fitpaperwork25@gmail.com');
GRANT ALL ON admin_checklist TO authenticated;

-- ── get_admin_businesses() — returns everything in one call ───────────────────
DROP FUNCTION IF EXISTS get_admin_businesses();
CREATE OR REPLACE FUNCTION get_admin_businesses()
RETURNS TABLE (
  id                  uuid,
  name                text,
  slug                text,
  plan                text,
  subscription_status text,
  created_at          timestamptz,
  owner_email         text,
  staff_pin           text,
  location_count      bigint,
  menu_item_count     bigint,
  order_count         bigint,
  qr_printed          boolean,
  staff_trained       boolean
)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF (auth.jwt() ->> 'email') IS DISTINCT FROM 'fitpaperwork25@gmail.com' THEN
    RAISE EXCEPTION 'Access denied: super-admin only';
  END IF;
  RETURN QUERY
  SELECT
    b.id, b.name, b.slug, b.plan, b.subscription_status, b.created_at,
    u.email::text,
    b.staff_pin,
    COUNT(DISTINCT l.id)::bigint,
    COUNT(DISTINCT mi.id)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COALESCE(ac.qr_printed,    false),
    COALESCE(ac.staff_trained, false)
  FROM businesses b
  LEFT JOIN auth.users u       ON u.id  = b.owner_id
  LEFT JOIN locations l        ON l.business_id = b.id
  LEFT JOIN menu_categories mc ON mc.business_id = b.id
  LEFT JOIN menu_items mi      ON mi.category_id = mc.id
  LEFT JOIN orders o           ON o.business_id  = b.id
  LEFT JOIN admin_checklist ac ON ac.business_id = b.id
  GROUP BY b.id, b.name, b.slug, b.plan, b.subscription_status,
           b.created_at, u.email, b.staff_pin, ac.qr_printed, ac.staff_trained
  ORDER BY b.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION get_admin_businesses() TO authenticated;

-- ── admin_update_staff_pin(biz_id, pin) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_update_staff_pin(p_biz_id uuid, p_pin text)
RETURNS void SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF (auth.jwt() ->> 'email') != 'fitpaperwork25@gmail.com' THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE businesses SET staff_pin = p_pin WHERE id = p_biz_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_update_staff_pin(uuid, text) TO authenticated;

-- ── admin_toggle_checklist(biz_id, field, value) ─────────────────────────────
CREATE OR REPLACE FUNCTION admin_toggle_checklist(p_biz_id uuid, p_field text, p_value boolean)
RETURNS void SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF (auth.jwt() ->> 'email') != 'fitpaperwork25@gmail.com' THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_field = 'qr_printed' THEN
    INSERT INTO admin_checklist (business_id, qr_printed)
      VALUES (p_biz_id, p_value)
      ON CONFLICT (business_id) DO UPDATE SET qr_printed = p_value, updated_at = now();
  ELSIF p_field = 'staff_trained' THEN
    INSERT INTO admin_checklist (business_id, staff_trained)
      VALUES (p_biz_id, p_value)
      ON CONFLICT (business_id) DO UPDATE SET staff_trained = p_value, updated_at = now();
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_toggle_checklist(uuid, text, boolean) TO authenticated;

-- ── admin_create_business(owner_id, name, slug, type, pin) ───────────────────
CREATE OR REPLACE FUNCTION admin_create_business(
  p_owner_id uuid, p_name text, p_slug text, p_type text, p_pin text
) RETURNS uuid SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  IF (auth.jwt() ->> 'email') != 'fitpaperwork25@gmail.com' THEN RAISE EXCEPTION 'Access denied'; END IF;
  INSERT INTO businesses (owner_id, name, slug, type, plan, subscription_status, staff_pin)
    VALUES (p_owner_id, p_name, p_slug, p_type, 'starter', 'trialing', p_pin)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_create_business(uuid, text, text, text, text) TO authenticated;
