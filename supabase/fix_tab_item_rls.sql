-- Allow anon to read orders and order_items that belong to a tab.
-- Required for the customer-facing "View Tab" item list in ScanPage.
-- Without these, fetchTabItems() gets 0 rows and shows "No items yet"
-- even when items have been added.

-- Narrow scope: only tab-linked orders are exposed to anon.
DROP POLICY IF EXISTS "anon can read tab orders" ON orders;
CREATE POLICY "anon can read tab orders"
  ON orders FOR SELECT
  TO anon
  USING (tab_id IS NOT NULL);

-- Narrow scope: only items whose order belongs to a tab.
DROP POLICY IF EXISTS "anon can read tab order items" ON order_items;
CREATE POLICY "anon can read tab order items"
  ON order_items FOR SELECT
  TO anon
  USING (
    order_id IN (SELECT id FROM orders WHERE tab_id IS NOT NULL)
  );
