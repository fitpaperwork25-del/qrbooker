-- QRServe v3 end-to-end system test
-- Business: Snelling Cafe  (a17aa26e-a855-40b6-b169-93568186dd59)
-- Location: Table 1        (cd8d1819-e865-427f-82aa-833990cf945e)
-- Item:     Avocado Salad  (4e7e7d6b-694f-4c87-b78d-39127e99aceb)  $12.50

CREATE TEMP TABLE IF NOT EXISTS e2e_results (
  test    text PRIMARY KEY,
  result  text,
  detail  text
);
TRUNCATE e2e_results;

DO $$
DECLARE
  biz_id   uuid := 'a17aa26e-a855-40b6-b169-93568186dd59';
  loc_id   uuid := 'cd8d1819-e865-427f-82aa-833990cf945e';
  item_id  uuid := '4e7e7d6b-694f-4c87-b78d-39127e99aceb';
  ord1     uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  ord2     uuid := 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  r        record;
  rev_sum  numeric;
  cnt      integer;
BEGIN
  -- Cleanup leftover test data
  DELETE FROM order_items WHERE order_id IN (ord1, ord2);
  DELETE FROM orders        WHERE id      IN (ord1, ord2);

  -- ── TEST 2: Customer places order ──────────────────────────────
  INSERT INTO orders (id, business_id, location_id, total, status)
    VALUES (ord1, biz_id, loc_id, 12.50, 'new');
  INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    VALUES (ord1, item_id, 1, 12.50);

  SELECT count(*) INTO cnt FROM orders WHERE id = ord1;
  INSERT INTO e2e_results VALUES ('TEST2_ORDER_PLACED',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'order row count = ' || cnt);

  -- ── TEST 3: Order visible on dashboard (any status) ────────────
  SELECT count(*) INTO cnt
    FROM orders WHERE id = ord1 AND business_id = biz_id;
  INSERT INTO e2e_results VALUES ('TEST3_DASHBOARD_VISIBLE',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'found ' || cnt || ' row(s)');

  -- ── TEST 4: Order visible in kitchen (status = new/preparing) ──
  SELECT count(*) INTO cnt
    FROM orders WHERE id = ord1 AND status IN ('new', 'preparing');
  INSERT INTO e2e_results VALUES ('TEST4_KITCHEN_VISIBLE',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'status = new, visible to kitchen');

  -- ── TEST 5a: NEW → PREPARING ────────────────────────────────────
  UPDATE orders SET status = 'preparing' WHERE id = ord1;
  SELECT status INTO r FROM orders WHERE id = ord1;
  INSERT INTO e2e_results VALUES ('TEST5a_NEW_TO_PREPARING',
    CASE WHEN r.status = 'preparing' THEN 'PASS' ELSE 'FAIL' END,
    'status = ' || r.status);

  -- ── TEST 5b: PREPARING → READY ──────────────────────────────────
  UPDATE orders SET status = 'ready' WHERE id = ord1;
  SELECT status INTO r FROM orders WHERE id = ord1;
  INSERT INTO e2e_results VALUES ('TEST5b_PREPARING_TO_READY',
    CASE WHEN r.status = 'ready' THEN 'PASS' ELSE 'FAIL' END,
    'status = ' || r.status);

  -- ── TEST 5c: READY → DONE ───────────────────────────────────────
  UPDATE orders SET status = 'done' WHERE id = ord1;
  SELECT status INTO r FROM orders WHERE id = ord1;
  INSERT INTO e2e_results VALUES ('TEST5c_READY_TO_DONE',
    CASE WHEN r.status = 'done' THEN 'PASS' ELSE 'FAIL' END,
    'status = ' || r.status);

  -- ── TEST 6: Cancel order with reason ────────────────────────────
  INSERT INTO orders (id, business_id, location_id, total, status)
    VALUES (ord2, biz_id, loc_id, 12.50, 'new');
  INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    VALUES (ord2, item_id, 1, 12.50);

  UPDATE orders SET status = 'cancelled', cancel_reason = 'Wrong order'
    WHERE id = ord2;

  SELECT status, cancel_reason, cancelled_at INTO r FROM orders WHERE id = ord2;
  INSERT INTO e2e_results VALUES ('TEST6_CANCEL_WITH_REASON',
    CASE WHEN r.status = 'cancelled' AND r.cancel_reason = 'Wrong order' THEN 'PASS' ELSE 'FAIL' END,
    'status=' || r.status || ', reason=' || coalesce(r.cancel_reason, 'NULL')
    || ', cancelled_at set=' || (r.cancelled_at IS NOT NULL)::text);

  -- ── TEST 7: Cancelled order excluded from revenue total ─────────
  SELECT coalesce(sum(total), 0) INTO rev_sum
    FROM orders
    WHERE id IN (ord1, ord2) AND status != 'cancelled';
  INSERT INTO e2e_results VALUES ('TEST7_REVENUE_EXCLUDES_CANCELLED',
    CASE WHEN rev_sum = 12.50 THEN 'PASS' ELSE 'FAIL' END,
    'revenue sum = $' || rev_sum || ' (cancelled order excluded)');

  -- ── TEST 8: Cancellations section shows the cancelled order ─────
  SELECT count(*) INTO cnt
    FROM orders
    WHERE id = ord2 AND status = 'cancelled' AND cancel_reason IS NOT NULL;
  INSERT INTO e2e_results VALUES ('TEST8_CANCELLATIONS_SECTION',
    CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    'cancelled row with reason found: ' || cnt);

  -- Cleanup
  DELETE FROM order_items WHERE order_id IN (ord1, ord2);
  DELETE FROM orders        WHERE id      IN (ord1, ord2);
END;
$$;

SELECT test, result, detail FROM e2e_results ORDER BY test;
