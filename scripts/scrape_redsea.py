import urllib.request, re, csv, os, json

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    return urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")

def strip_tags(html):
    return re.sub(r"<[^>]+>", " ", html)

def clean(s):
    return re.sub(r"\s+", " ", s).strip()

def scrape_menu(url):
    html = fetch(url)

    # Find all section blocks — spotapps uses divs with category labels above item grids
    # Extract raw text lines that have prices
    lines = [clean(strip_tags(l)) for l in re.split(r"<(?:br|/div|/li|/p|/tr)[^>]*>", html)]

    items = []
    current_category = "Menu"
    price_re = re.compile(r"\$\s*(\d+\.?\d{0,2})")

    # Try to find category names by looking for lines that precede price-containing lines
    # and look like section headers (no price, 2-40 chars, mostly alpha)
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        has_price = price_re.search(line)
        if not has_price:
            # Could be a category if it's short and alphabetic
            if 3 <= len(line) <= 50 and re.match(r"^[A-Za-z&/ '-]+$", line) and line[0].isupper():
                # Check if next few lines have prices
                upcoming = lines[i+1:i+5]
                if any(price_re.search(u) for u in upcoming):
                    current_category = line
            continue
        # Has price — extract item name
        price_match = price_re.search(line)
        price = price_match.group(1)
        # Name = everything before the price marker
        name = line[:price_match.start()].strip(" -–—|$·•\t")
        name = re.sub(r"\s+", " ", name).strip()
        if 3 <= len(name) <= 80:
            items.append({"category": current_category, "name": name, "price": price, "description": ""})

    return items

def scrape_spotapps_json(base_url):
    """SpotApps sites embed menu JSON in script tags sometimes."""
    html = fetch(base_url)
    # Look for JSON arrays with name/price patterns
    json_blocks = re.findall(r"\{[^{}]{20,500}\}", html)
    items = []
    for block in json_blocks:
        try:
            obj = json.loads(block)
            name = obj.get("name") or obj.get("item_name") or obj.get("title")
            price = obj.get("price") or obj.get("item_price")
            cat = obj.get("category") or obj.get("category_name") or "Menu"
            if name and price:
                items.append({"category": clean(str(cat)), "name": clean(str(name)), "price": str(price), "description": ""})
        except Exception:
            continue
    return items

if __name__ == "__main__":
    base = "https://theredseampls.com"
    food_url = base + "/minneapolis-west-bank-cedar-riverside-the-red-sea-ethiopian-restaurant-food-menu"
    drink_url = base + "/minneapolis-west-bank-cedar-riverside-the-red-sea-ethiopian-restaurant-drink-menu"

    print("Scraping food menu...")
    food_items = scrape_menu(food_url)
    print(f"  Found {len(food_items)} food items")

    print("Scraping drink menu...")
    drink_items = scrape_menu(drink_url)
    for item in drink_items:
        if item["category"] == "Menu":
            item["category"] = "Drinks"
    print(f"  Found {len(drink_items)} drink items")

    # Try JSON extraction as fallback
    if len(food_items) < 5:
        print("Trying JSON extraction...")
        food_items = scrape_spotapps_json(food_url)
        print(f"  Found {len(food_items)} items via JSON")

    all_items = food_items + drink_items

    if not all_items:
        print("No items found - site may require JS rendering")
    else:
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "red_sea_menu.csv")
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["category","name","price","description"])
            w.writeheader()
            w.writerows(all_items)
        print(f"\nSaved {len(all_items)} items to {out}")
        print("\nPreview:")
        print(f"{'Category':<25} {'Name':<35} {'Price':>7}")
        print("-" * 70)
        for item in all_items[:15]:
            print(f"{item['category']:<25} {item['name']:<35} ${item['price']:>6}")
        if len(all_items) > 15:
            print(f"  ... and {len(all_items)-15} more")
