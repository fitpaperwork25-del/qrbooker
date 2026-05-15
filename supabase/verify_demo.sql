SELECT
  b.name AS business, b.slug, b.staff_pin, b.plan,
  u.email,
  (SELECT count(*)::int FROM locations WHERE business_id = b.id) AS tables,
  (SELECT count(*)::int FROM menu_categories WHERE business_id = b.id) AS categories,
  (SELECT count(*)::int FROM menu_items mi
     JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE mc.business_id = b.id) AS items
FROM businesses b
JOIN auth.users u ON u.id = b.owner_id
WHERE b.slug = 'demo-restaurant';
