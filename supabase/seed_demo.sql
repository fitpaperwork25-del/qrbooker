-- Demo business seed
-- Creates: auth user, business, 5 tables, 3 categories, 10 menu items, staff PIN
-- Safe to re-run: upserts on email/slug.

DO $$
DECLARE
  v_user_id  uuid;
  v_biz_id   uuid;
  v_cat1     uuid := gen_random_uuid();
  v_cat2     uuid := gen_random_uuid();
  v_cat3     uuid := gen_random_uuid();
BEGIN

  -- ── 1. Auth user ──────────────────────────────────────────────
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'demo@qrserve.app';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id,
      email, encrypted_password, email_confirmed_at,
      created_at, updated_at,
      role, aud,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'demo@qrserve.app',
      crypt('Demo2026', gen_salt('bf', 10)),
      now(), now(), now(),
      'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false, false
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id,
      v_user_id,
      'demo@qrserve.app',
      jsonb_build_object('sub', v_user_id::text, 'email', 'demo@qrserve.app'),
      'email',
      now(), now(), now()
    );

    RAISE NOTICE 'Created auth user %', v_user_id;
  ELSE
    -- Update password in case it changed
    UPDATE auth.users
       SET encrypted_password = crypt('Demo2026', gen_salt('bf', 10)),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
    RAISE NOTICE 'Auth user already exists: %', v_user_id;
  END IF;

  -- ── 2. Business ───────────────────────────────────────────────
  SELECT id INTO v_biz_id FROM businesses WHERE slug = 'demo-restaurant';

  IF v_biz_id IS NULL THEN
    v_biz_id := gen_random_uuid();
    INSERT INTO businesses (
      id, owner_id, name, slug, type,
      plan, subscription_status, staff_pin
    ) VALUES (
      v_biz_id, v_user_id, 'Demo Restaurant', 'demo-restaurant', 'restaurant',
      'pro', 'active', '1234'
    );
    RAISE NOTICE 'Created business %', v_biz_id;
  ELSE
    UPDATE businesses
       SET owner_id = v_user_id, staff_pin = '1234',
           plan = 'pro', subscription_status = 'active'
     WHERE id = v_biz_id;
    RAISE NOTICE 'Business already exists: %', v_biz_id;
  END IF;

  -- ── 3. Tables (locations) ─────────────────────────────────────
  INSERT INTO locations (business_id, name, slug, is_active)
  VALUES
    (v_biz_id, 'Table 1', 'table-1', true),
    (v_biz_id, 'Table 2', 'table-2', true),
    (v_biz_id, 'Table 3', 'table-3', true),
    (v_biz_id, 'Table 4', 'table-4', true),
    (v_biz_id, 'Table 5', 'table-5', true)
  ON CONFLICT (business_id, slug) DO NOTHING;

  -- ── 4. Menu categories ────────────────────────────────────────
  -- Delete existing categories (cascade-deletes items) then re-insert for idempotency
  DELETE FROM menu_categories WHERE business_id = v_biz_id;

  INSERT INTO menu_categories (id, business_id, name, display_order, is_visible) VALUES
    (v_cat1, v_biz_id, 'Starters', 0, true),
    (v_cat2, v_biz_id, 'Mains',    1, true),
    (v_cat3, v_biz_id, 'Drinks',   2, true);

  -- ── 5. Menu items ─────────────────────────────────────────────
  INSERT INTO menu_items (category_id, name, price, description, is_available, display_order) VALUES
    -- Starters (3)
    (v_cat1, 'Bruschetta',       8.50,  'Toasted sourdough, heirloom tomato, basil, aged balsamic',     true, 0),
    (v_cat1, 'Calamari Fritti', 12.00,  'Crispy squid rings, lemon aioli, marinara',                    true, 1),
    (v_cat1, 'Soup of the Day',  7.00,  'Chef''s daily soup served with house bread',                   true, 2),
    -- Mains (4)
    (v_cat2, 'Grilled Salmon',  24.00,  'Atlantic salmon, seasonal vegetables, lemon butter sauce',     true, 0),
    (v_cat2, 'NY Strip Steak',  34.00,  '10 oz strip, hand-cut fries, house salad',                    true, 1),
    (v_cat2, 'Mushroom Risotto',18.00,  'Arborio rice, wild mushrooms, truffle oil, parmesan',          true, 2),
    (v_cat2, 'Chicken Marsala', 22.00,  'Pan-seared chicken, marsala wine sauce, whipped potatoes',     true, 3),
    -- Drinks (3)
    (v_cat3, 'House Wine',       9.00,  'Red or white — ask your server for today''s selection',        true, 0),
    (v_cat3, 'Craft Beer',       7.50,  'Rotating local tap — ask for current options',                 true, 1),
    (v_cat3, 'Fresh Lemonade',   4.50,  'House-made with mint and a hint of ginger',                    true, 2);

  RAISE NOTICE 'Demo seed complete. biz_id=%', v_biz_id;
END;
$$;
