-- Full cleanup of demo user and all dependent data, in FK order.
DO $$
DECLARE
  v_user_id uuid;
  v_biz_id  uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'demo@qrserve.app';
  SELECT id INTO v_biz_id  FROM businesses  WHERE slug  = 'demo-restaurant';

  IF v_biz_id IS NOT NULL THEN
    -- Remove order items then orders (orders FK → businesses, no cascade)
    DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE business_id = v_biz_id);
    DELETE FROM orders       WHERE business_id = v_biz_id;
    -- Remove tabs
    DELETE FROM tabs WHERE business_id = v_biz_id;
    -- Remove menu
    DELETE FROM menu_items WHERE category_id IN (SELECT id FROM menu_categories WHERE business_id = v_biz_id);
    DELETE FROM menu_categories WHERE business_id = v_biz_id;
    -- Remove locations
    DELETE FROM locations WHERE business_id = v_biz_id;
    -- Remove business
    DELETE FROM businesses WHERE id = v_biz_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.users      WHERE id      = v_user_id;
  END IF;

  RAISE NOTICE 'Demo cleanup done. user=% biz=%', v_user_id, v_biz_id;
END;
$$;
