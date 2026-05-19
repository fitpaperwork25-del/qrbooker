-- Exclude platform-type businesses from the admin client list.
-- Also returns b.type so the frontend can double-filter if needed.
-- Run in Supabase SQL editor (project yizvlbupvamsietgjtys).

CREATE OR REPLACE FUNCTION get_admin_businesses()
RETURNS TABLE (
  id                  uuid,
  name                text,
  slug                text,
  type                text,
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
    b.id, b.name, b.slug, b.type, b.plan, b.subscription_status, b.created_at,
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
  WHERE b.type IS DISTINCT FROM 'platform'
  GROUP BY b.id, b.name, b.slug, b.type, b.plan, b.subscription_status,
           b.created_at, u.email, b.staff_pin, ac.qr_printed, ac.staff_trained
  ORDER BY b.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION get_admin_businesses() TO authenticated;
