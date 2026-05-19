/**
 * Scrapes the Red Sea Restaurant menu from theredseampls.com
 * then inserts all categories + items into Supabase.
 *
 * Usage:
 *   node scripts/import_redsea_menu.mjs <SUPABASE_SERVICE_ROLE_KEY>
 *
 * The Supabase project URL is hardcoded (extracted from the deployed bundle).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yizvlbupvamsietgjtys.supabase.co";
const BUSINESS_ID  = "67557302-fce6-433e-9449-2966e71f0004"; // Red Sea in local records

const SERVICE_ROLE_KEY = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error("Usage: node scripts/import_redsea_menu.mjs <SUPABASE_SERVICE_ROLE_KEY>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Scraper ──────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Parses SpotApps food menu HTML.
 * Structure: <h2>Category</h2> ... <h3>Item Name</h3> ... <div class="food-price">$X.XX</div>
 */
function parseMenu(html, defaultCategory = "Menu") {
  const items = [];
  let currentCategory = defaultCategory;

  // Walk through the menu body — split on tags we care about
  const tokenRe = /<h2[^>]*>(.*?)<\/h2>|<h3[^>]*>(.*?)<\/h3>|<div class="food-price">(.*?)<\/div>|<div class="food-item-description">(.*?)<\/div>/gs;

  let pendingName = null;
  let pendingDesc = null;

  for (const match of html.matchAll(tokenRe)) {
    const [, h2, h3, priceDiv, descDiv] = match;

    if (h2 !== undefined) {
      const cat = stripTags(h2);
      if (cat) currentCategory = cat;
      pendingName = null;
    } else if (h3 !== undefined) {
      pendingName = stripTags(h3);
      pendingDesc = null;
    } else if (descDiv !== undefined) {
      pendingDesc = stripTags(descDiv);
    } else if (priceDiv !== undefined && pendingName) {
      const rawPrice = stripTags(priceDiv);
      const priceMatch = rawPrice.match(/(\d+\.?\d{0,2})/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      items.push({
        category: currentCategory,
        name: pendingName,
        price,
        description: pendingDesc || "",
      });
      pendingName = null;
      pendingDesc = null;
    }
  }

  return items;
}

async function scrapeMenu() {
  const base = "https://theredseampls.com";
  const foodUrl  = `${base}/minneapolis-west-bank-cedar-riverside-the-red-sea-ethiopian-restaurant-food-menu`;
  const drinkUrl = `${base}/minneapolis-west-bank-cedar-riverside-the-red-sea-ethiopian-restaurant-drink-menu`;

  console.log("Scraping food menu…");
  const foodHtml  = await fetchHtml(foodUrl);
  const foodItems = parseMenu(foodHtml);
  console.log(`  → ${foodItems.length} items across ${new Set(foodItems.map(i => i.category)).size} categories`);

  console.log("Scraping drink menu…");
  const drinkHtml  = await fetchHtml(drinkUrl);
  const drinkItems = parseMenu(drinkHtml, "Drinks");
  console.log(`  → ${drinkItems.length} drink items`);

  return [...foodItems, ...drinkItems];
}

// ── Importer ─────────────────────────────────────────────────────────────────

async function verifyBusiness() {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("id", BUSINESS_ID)
    .single();

  if (error) {
    // Try searching by name
    const { data: byName, error: e2 } = await supabase
      .from("businesses")
      .select("id, name, slug")
      .ilike("name", "%red sea%")
      .limit(5);

    if (e2 || !byName?.length) {
      throw new Error(`Business ${BUSINESS_ID} not found and name search failed: ${e2?.message}`);
    }
    console.log("Business not found by ID. Matches by name:");
    byName.forEach(b => console.log(`  ${b.id}  ${b.name}  (${b.slug})`));
    throw new Error("Update BUSINESS_ID in this script to the correct ID above, then re-run.");
  }

  return data;
}

async function checkExistingMenu(bizId) {
  const { data: cats } = await supabase
    .from("menu_categories")
    .select("id, name")
    .eq("business_id", bizId);
  return cats ?? [];
}

async function importMenu(bizId, allItems) {
  // Group by category (preserving insertion order)
  const categoryOrder = [];
  const byCategory = {};
  for (const item of allItems) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = [];
      categoryOrder.push(item.category);
    }
    byCategory[item.category].push(item);
  }

  console.log(`\nInserting ${categoryOrder.length} categories…`);
  const categoryIdMap = {};

  for (let i = 0; i < categoryOrder.length; i++) {
    const catName = categoryOrder[i];
    const { data, error } = await supabase
      .from("menu_categories")
      .insert({ business_id: bizId, name: catName, display_order: i, is_visible: true })
      .select("id")
      .single();

    if (error) {
      console.error(`  ✗ Category "${catName}": ${error.message}`);
      continue;
    }
    categoryIdMap[catName] = data.id;
    console.log(`  ✓ [${i + 1}/${categoryOrder.length}] ${catName}`);
  }

  console.log(`\nInserting menu items…`);
  let inserted = 0;
  let failed = 0;

  for (const catName of categoryOrder) {
    const catId = categoryIdMap[catName];
    if (!catId) continue;

    const items = byCategory[catName];
    const rows = items.map((item, idx) => ({
      category_id: catId,
      name: item.name,
      price: item.price,
      description: item.description || null,
      is_available: true,
      display_order: idx,
    }));

    const { error } = await supabase.from("menu_items").insert(rows);
    if (error) {
      console.error(`  ✗ Items for "${catName}": ${error.message}`);
      failed += rows.length;
    } else {
      console.log(`  ✓ ${catName}: ${rows.length} items`);
      inserted += rows.length;
    }
  }

  return { inserted, failed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Red Sea Menu Import ===\n");

  // 1. Verify business
  console.log(`Verifying business ID ${BUSINESS_ID}…`);
  const biz = await verifyBusiness();
  console.log(`  ✓ Found: "${biz.name}" (slug: ${biz.slug})\n`);

  // 2. Check for existing menu
  const existing = await checkExistingMenu(biz.id);
  if (existing.length > 0) {
    console.log(`⚠️  Business already has ${existing.length} categories:`);
    existing.forEach(c => console.log(`   - ${c.name}`));
    console.log("\nAbort? (re-run is safe — will add duplicates). Ctrl+C to cancel, or wait 5s to continue…");
    await new Promise(r => setTimeout(r, 5000));
  }

  // 3. Scrape
  const allItems = await scrapeMenu();
  if (!allItems.length) {
    console.error("No items scraped — aborting.");
    process.exit(1);
  }

  // Print preview
  console.log("\nMenu preview:");
  console.log(`${"Category".padEnd(25)} ${"Name".padEnd(38)} ${"Price".padStart(7)}`);
  console.log("-".repeat(72));
  for (const item of allItems) {
    console.log(`${item.category.padEnd(25)} ${item.name.padEnd(38)} $${String(item.price.toFixed(2)).padStart(6)}`);
  }
  console.log(`\nTotal: ${allItems.length} items\n`);

  // 4. Import
  const { inserted, failed } = await importMenu(biz.id, allItems);

  console.log(`\n=== Done ===`);
  console.log(`  Inserted: ${inserted} items`);
  if (failed) console.log(`  Failed:   ${failed} items`);
  console.log(`\nOpen the dashboard at https://qrwegn.com/dashboard to verify.`);
}

main().catch(err => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
