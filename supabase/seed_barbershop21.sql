-- Seed service categories and items for BarberShop 21 (slug: barbershop-21)
-- All prices set to 0.00 — owner will update via dashboard.

do $$
declare
  v_business_id uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
begin
  -- Resolve business ID
  select id into strict v_business_id
  from businesses
  where slug = 'barbershop-21';

  -- ── 1. Traditional Cuts ───────────────────────────────────────
  insert into menu_categories (business_id, name, display_order)
  values (v_business_id, 'Traditional Cuts', 1)
  returning id into c1;

  insert into menu_items (category_id, name, price, display_order) values
    (c1, 'Men''s Haircut',  0.00, 1),
    (c1, 'Kids Haircut',    0.00, 2),
    (c1, 'Senior Haircut',  0.00, 3),
    (c1, 'Lineup/Edge Up',  0.00, 4),
    (c1, 'Low Fade',        0.00, 5),
    (c1, 'Mid Fade',        0.00, 6),
    (c1, 'High Fade',       0.00, 7),
    (c1, 'Taper Cut',       0.00, 8);

  -- ── 2. Shaves ─────────────────────────────────────────────────
  insert into menu_categories (business_id, name, display_order)
  values (v_business_id, 'Shaves', 2)
  returning id into c2;

  insert into menu_items (category_id, name, price, display_order) values
    (c2, 'Hot Towel Shave', 0.00, 1),
    (c2, 'Beard Trim',      0.00, 2),
    (c2, 'Beard Shape Up',  0.00, 3),
    (c2, 'Mustache Trim',   0.00, 4),
    (c2, 'Head Shave',      0.00, 5);

  -- ── 3. Wig Install ────────────────────────────────────────────
  insert into menu_categories (business_id, name, display_order)
  values (v_business_id, 'Wig Install', 3)
  returning id into c3;

  insert into menu_items (category_id, name, price, display_order) values
    (c3, 'Wig Install Glue',    0.00, 1),
    (c3, 'Wig Install No Glue', 0.00, 2),
    (c3, 'Wig Styling',         0.00, 3),
    (c3, 'Wig Maintenance',     0.00, 4),
    (c3, 'Custom Wig Install',  0.00, 5);

  -- ── 4. Design Braids ──────────────────────────────────────────
  insert into menu_categories (business_id, name, display_order)
  values (v_business_id, 'Design Braids', 4)
  returning id into c4;

  insert into menu_items (category_id, name, price, display_order) values
    (c4, 'Box Braids',          0.00, 1),
    (c4, 'Cornrows',            0.00, 2),
    (c4, 'Feed-in Braids',      0.00, 3),
    (c4, 'Knotless Braids',     0.00, 4),
    (c4, 'Locs Retwist',        0.00, 5),
    (c4, 'Braid Design Pattern',0.00, 6);

  raise notice 'Seeded BarberShop 21 (%) — 4 categories, 24 items.', v_business_id;
end;
$$;
