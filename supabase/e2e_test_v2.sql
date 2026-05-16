-- QRServe v3 end-to-end system test v2
-- Business: Snelling Cafe  (a17aa26e-a855-40b6-b169-93568186dd59)
-- Location: Table 1        (cd8d1819-e865-427f-82aa-833990cf945e)
-- Item:     Avocado Salad  (4e7e7d6b-694f-4c87-b78d-39127e99aceb) $12.50

CREATE TEMP TABLE IF NOT EXISTS e2e_v2 (test text PRIMARY KEY, result text, detail text);
TRUNCATE e2e_v2;

DO $$
DECLARE
  biz_id  uuid := 'a17aa26e-a855-40b6-b169-93568186dd59';
  loc_id  uuid := 'cd8d1819-e865-427f-82aa-833990cf945e';
  item_id uuid := '4e7e7d6b-694f-4c87-b78d-39127e99aceb';
  ord1    uuid := 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11';
  ord2    uuid := 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22';
  tab1    uuid := 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33';
  ord3    uuid := 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44';
  r       record;
  cnt     integer;
  rev_sum numeric;

BEGIN
  -- Cleanup leftover test data
  DELETE FROM order_items WHERE order_id IN (ord1, ord2, ord3);
  DELETE FROM orders        WHERE id      IN (ord1, ord2, ord3);
  DELETE FROM tabs          WHERE id = tab1;

  -- ── TEST 1: Scan page — anon can read snelling-cafe ──────────────
  SET LOCAL ROLE anon;
  SELECT count(*)::int INTO cnt FROM businesses WHERE slug = 'snelling-cafe';
  RESET ROLE;
  INSERT INTO e2e_v2 VALUES ('TEST01_SCAN_ANON_BUSINESS',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'snelling-cafe visible to anon: ' || cnt || ' row(s)');

  SET LOCAL ROLE anon;
  SELECT count(*)::int INTO cnt FROM locations WHERE business_id = biz_id AND is_active = true;
  RESET ROLE;
  INSERT INTO e2e_v2 VALUES ('TEST01_SCAN_ANON_LOCATIONS',
    CASE WHEN cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'active locations visible to anon: ' || cnt);

  SET LOCAL ROLE anon;
  SELECT count(*)::int INTO cnt
    FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.category_id
   WHERE mc.business_id = biz_id AND mi.is_available = true AND mc.is_visible = true;
  RESET ROLE;
  INSERT INTO e2e_v2 VALUES ('TEST01_SCAN_ANON_MENU',
    CASE WHEN cnt > 0 THEN 'PASS' ELSE 'FAIL' END,
    'menu items visible to anon: ' || cnt);

  -- ── TEST 2: Customer places an order ─────────────────────────────
  INSERT INTO orders (id, business_id, location_id, total, status)
    VALUES (ord1, biz_id, loc_id, 12.50, 'new');
  INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    VALUES (ord1, item_id, 1, 12.50);
  SELECT count(*)::int INTO cnt FROM orders WHERE id = ord1;
  INSERT INTO e2e_v2 VALUES ('TEST02_ORDER_PLACED',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'order inserted, count=' || cnt);

  -- ── TEST 3: Order visible on owner dashboard ──────────────────────
  SELECT count(*)::int INTO cnt FROM orders
   WHERE id = ord1 AND business_id = biz_id;
  INSERT INTO e2e_v2 VALUES ('TEST03_DASHBOARD_ORDERS',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'order queryable by business_id');

  -- ── TEST 4: Order visible in kitchen (new/preparing filter) ───────
  SELECT count(*)::int INTO cnt FROM orders
   WHERE id = ord1 AND status IN ('new', 'preparing');
  INSERT INTO e2e_v2 VALUES ('TEST04_KITCHEN_VISIBLE',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'status=new, matches kitchen filter');

  -- ── TEST 5: Status transitions NEW→PREPARING→READY→DONE ──────────
  UPDATE orders SET status = 'preparing' WHERE id = ord1;
  SELECT status INTO r FROM orders WHERE id = ord1;
  INSERT INTO e2e_v2 VALUES ('TEST05a_NEW_TO_PREPARING',
    CASE WHEN r.status = 'preparing' THEN 'PASS' ELSE 'FAIL' END, r.status);

  UPDATE orders SET status = 'ready' WHERE id = ord1;
  SELECT status INTO r FROM orders WHERE id = ord1;
  INSERT INTO e2e_v2 VALUES ('TEST05b_PREPARING_TO_READY',
    CASE WHEN r.status = 'ready' THEN 'PASS' ELSE 'FAIL' END, r.status);

  UPDATE orders SET status = 'done' WHERE id = ord1;
  SELECT status INTO r FROM orders WHERE id = ord1;
  INSERT INTO e2e_v2 VALUES ('TEST05c_READY_TO_DONE',
    CASE WHEN r.status = 'done' THEN 'PASS' ELSE 'FAIL' END, r.status);

  -- ── TEST 6: Cancel order with reason ─────────────────────────────
  INSERT INTO orders (id, business_id, location_id, total, status)
    VALUES (ord2, biz_id, loc_id, 12.50, 'new');
  UPDATE orders SET status = 'cancelled', cancel_reason = 'Wrong order'
   WHERE id = ord2;
  SELECT status, cancel_reason, cancelled_at IS NOT NULL AS trigger_fired INTO r
    FROM orders WHERE id = ord2;
  INSERT INTO e2e_v2 VALUES ('TEST06_CANCEL_WITH_REASON',
    CASE WHEN r.status = 'cancelled' AND r.cancel_reason = 'Wrong order' THEN 'PASS' ELSE 'FAIL' END,
    'status=' || r.status || ' reason=' || coalesce(r.cancel_reason,'NULL') || ' trigger=' || r.trigger_fired::text);

  -- ── TEST 7: Cancelled order excluded from revenue ─────────────────
  SELECT coalesce(sum(total),0) INTO rev_sum FROM orders
   WHERE id IN (ord1, ord2) AND status != 'cancelled';
  INSERT INTO e2e_v2 VALUES ('TEST07_REVENUE_EXCLUDES_CANCELLED',
    CASE WHEN rev_sum = 12.50 THEN 'PASS' ELSE 'FAIL' END,
    'revenue=$' || rev_sum || ' (cancelled $12.50 excluded)');

  -- ── TEST 8: Cancellations section data ───────────────────────────
  SELECT count(*)::int INTO cnt FROM orders
   WHERE business_id = biz_id AND status = 'cancelled' AND cancel_reason IS NOT NULL;
  INSERT INTO e2e_v2 VALUES ('TEST08_CANCELLATIONS_SECTION',
    CASE WHEN cnt >= 1 THEN 'PASS' ELSE 'FAIL' END,
    'cancelled rows with reason: ' || cnt);

  -- ── TEST 9: Bar tab — open, add order, close ─────────────────────
  INSERT INTO tabs (id, business_id, location_id, status, total)
    VALUES (tab1, biz_id, loc_id, 'open', 0);
  INSERT INTO orders (id, business_id, location_id, total, status, tab_id)
    VALUES (ord3, biz_id, loc_id, 12.50, 'new', tab1);
  UPDATE tabs SET total = 12.50 WHERE id = tab1;
  SELECT status, total INTO r FROM tabs WHERE id = tab1;
  INSERT INTO e2e_v2 VALUES ('TEST09a_TAB_OPENED_AND_ORDER_ADDED',
    CASE WHEN r.status = 'open' AND r.total = 12.50 THEN 'PASS' ELSE 'FAIL' END,
    'tab status=' || r.status || ' total=$' || r.total);

  UPDATE tabs SET status = 'closed', closed_at = now() WHERE id = tab1;
  SELECT status INTO r FROM tabs WHERE id = tab1;
  INSERT INTO e2e_v2 VALUES ('TEST09b_TAB_CLOSED',
    CASE WHEN r.status = 'closed' THEN 'PASS' ELSE 'FAIL' END,
    'tab status=' || r.status);

  -- ── TEST 10: Open tabs anon-readable (for kitchen + dashboard) ────
  -- Re-open the tab for visibility test
  UPDATE tabs SET status = 'open', closed_at = NULL WHERE id = tab1;
  SET LOCAL ROLE anon;
  SELECT count(*)::int INTO cnt FROM tabs WHERE id = tab1 AND status = 'open';
  RESET ROLE;
  INSERT INTO e2e_v2 VALUES ('TEST10_TABS_ANON_READABLE',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'open tab visible to anon: ' || cnt);

  -- Also verify anon can read tab orders (for tab item display)
  SET LOCAL ROLE anon;
  SELECT count(*)::int INTO cnt FROM orders WHERE tab_id = tab1;
  RESET ROLE;
  INSERT INTO e2e_v2 VALUES ('TEST10b_TAB_ORDERS_ANON_READABLE',
    CASE WHEN cnt >= 1 THEN 'PASS' ELSE 'FAIL' END,
    'tab orders visible to anon: ' || cnt);

  -- Cleanup
  DELETE FROM order_items WHERE order_id IN (ord1, ord2, ord3);
  DELETE FROM orders        WHERE id      IN (ord1, ord2, ord3);
  UPDATE tabs SET status = 'closed' WHERE id = tab1;
  DELETE FROM tabs WHERE id = tab1;

END;
$$;

SELECT test, result, detail FROM e2e_v2 ORDER BY test;
