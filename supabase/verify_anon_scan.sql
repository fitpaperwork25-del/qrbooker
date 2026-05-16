SET ROLE anon;
SELECT 'businesses' AS tbl, count(*)::int AS rows
  FROM businesses WHERE id = 'a17aa26e-a855-40b6-b169-93568186dd59'
UNION ALL
SELECT 'locations', count(*)::int
  FROM locations WHERE business_id = 'a17aa26e-a855-40b6-b169-93568186dd59' AND is_active = true
UNION ALL
SELECT 'menu_categories', count(*)::int
  FROM menu_categories WHERE business_id = 'a17aa26e-a855-40b6-b169-93568186dd59' AND is_visible = true
UNION ALL
SELECT 'menu_items', count(*)::int
  FROM menu_items WHERE category_id IN (
    SELECT id FROM menu_categories
    WHERE business_id = 'a17aa26e-a855-40b6-b169-93568186dd59' AND is_visible = true
  ) AND is_available = true
UNION ALL
SELECT 'tabs', count(*)::int
  FROM tabs WHERE business_id = 'a17aa26e-a855-40b6-b169-93568186dd59' AND status = 'open';
