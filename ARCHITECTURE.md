# QRServe v2 — Architecture Reference

> Read this before touching any file. Update it after every structural change.

---

## Project Identity

- **Product name:** QRServe (formerly QRSolutions — rename still in progress)
- **Live URL:** https://qrsolutions-v2.vercel.app
- **GitHub:** fitpaperwork25-del/qrsolutions-v2
- **Local path:** C:\Users\Michael Etbarekh\Desktop\Projects\QRSolutions\qrs
- **Owner email:** fitpaperwork25@gmail.com

---

## Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | React + Vite                      |
| Database    | Supabase (pzpgjyuvtmjetvpyavnt)   |
| Auth        | Supabase magic link               |
| Payments    | Stripe (LIVE mode)                |
| Email       | Resend                            |
| Deployment  | Vercel (auto-deploys from main)   |

---

## Stripe Prices (LIVE)

| Plan       | Price ID              | Amount |
|------------|-----------------------|--------|
| Starter    | price_1TUUx42...      | $49/mo |
| Pro        | price_1TUUya...       | $99/mo |
| Enterprise | price_1TUUzg...       | $199/mo|

---

## Supabase Tables

### `businesses`
Core business record. One row per business.
- `id` (uuid, PK)
- `owner_id` → auth.users
- `name`, `slug`, `type` (restaurant | cafe | barbershop | salon | hotel)
- `plan` (starter | pro | enterprise)
- `subscription_status` (active | trialing | expired | cancelled | past_due)
- `staff_pin` (4-digit string)
- `stripe_customer_id`, `stripe_subscription_id`
- `current_period_end` (timestamptz) — set by stripe-webhook on invoice.paid
- `logo_url`, `hero_image_url`, `tagline`, `accent` (text) — set by BrandingTab

### `locations`
Tables/seats within a business. Used to generate QR codes.
- `id` (uuid, PK)
- `business_id` → businesses
- `name`, `label`, `slug`
- `is_active`

### `menu_categories`
- `id`, `business_id`, `name`, `display_order`, `is_visible`

### `menu_items`
- `id`, `category_id`, `name`, `price`, `description`, `image_url`, `is_available`, `display_order`

### `orders`
- `id`, `location_id`, `business_id`, `total`, `status` (new | preparing | ready | done | cancelled)
- `created_at`, `updated_at`

### `order_items`
- `id`, `order_id`, `menu_item_id`, `quantity`, `unit_price`

### `business_expenses`
Manual expense entries for financials.
- `id`, `business_id`, `amount`, `category`, `description`
- `expense_date` (date), `created_at`

---

## Key Routes

| Route                        | Component            | Notes                          |
|------------------------------|----------------------|--------------------------------|
| `/`                          | LandingPage          |                                |
| `/login`                     | LoginPage            | Magic link only                |
| `/register`                  | RegisterPage / OnboardingPage | New business signup   |
| `/onboarding-complete`       | OnboardingComplete   |                                |
| `/dashboard`                 | DashboardPage        | Owner dashboard                |
| `/scan/:bizId/:locationId`   | ScanPage             | Customer-facing order page     |
| `/staff-login`               | StaffLoginPage       | PIN login for staff            |
| `/pricing`                   | PricingPage          |                                |
| `/success`                   | SuccessPage          | Post-Stripe redirect           |

---

## DashboardPage Tab Structure

File: `src/pages/DashboardPage.jsx`

Tabs rendered per business type:

```
restaurant: overview, tables, menu, orders, blocked, financials
cafe:        overview, tables, menu, orders, bookings, blocked, financials
barbershop:  overview, services, bookings, staff, blocked, financials
salon:       overview, services, bookings, staff, blocked, financials
hotel:       overview, rooms, bookings, requests, blocked, financials
```

Each tab is a self-contained component defined in the same file or imported from `src/components/`.

---

## Component Files

| File                                  | Purpose                                      |
|---------------------------------------|----------------------------------------------|
| `src/pages/DashboardPage.jsx`         | Main owner dashboard — all tab logic         |
| `src/pages/ScanPage.jsx`             | Customer QR scan → menu → order flow         |
| `src/pages/LoginPage.jsx`            | Magic link login                             |
| `src/pages/RegisterPage.jsx`         | New business onboarding                      |
| `src/pages/PricingPage.jsx`          | Stripe checkout trigger                      |
| `src/pages/SuccessPage.jsx`          | Post-payment confirmation                    |
| `src/components/FinancialsTab.jsx`   | P&L, Income Statement, Cash Flow, expenses   |
| `src/components/BrandingTab.jsx`     | Logo/hero upload, accent color, tagline, live preview |
| `src/components/SubscriptionTab.jsx` | Plan/status display, Stripe billing portal, dunning banner |
| `src/pages/AdminPage.tsx`            | PIN-gated super admin — all clients, MRR, plan override |
| `src/components/BlockedDatesTab.jsx` | Date blocking for availability               |
| `src/lib/supabase.js`                | Supabase client init                         |
| `src/lib/useAuth.js`                 | Auth hook (session, signOut)                 |

---

## Active Businesses in Supabase

| Business        | ID prefix  | Status    | Plan |
|-----------------|------------|-----------|------|
| Snelling Cafe   | 28d1fb78   | Active    | Pro  |
| Red Sea         | 72333431   | Pending   | —    |
| Thirty Bales    | 88f79329   | Pending   | —    |

Staff PIN: `2026`

---

## Scan URL Format

```
/scan/{bizId}/{locationId}
```

Example:
```
https://qrsolutions-v2.vercel.app/scan/28d1fb78-xxxx/table-id-xxxx
```

---

## Open Items (as of 2026-05-12)

- [ ] Rename "QRSolutions" → "QRServe" across all UI text and codebase
- [ ] Multi-business support — no "Add another business" flow post-login yet
- [ ] iPhone scan page mobile UX — button blinks, no feedback
- [ ] Contact Red Sea and Thirty Bales owners for real emails
- [ ] Clean test orders from Snelling dashboard
- [ ] Locate and verify super admin dashboard route
- [ ] Delete live keys file from Desktop

---

## Design Tokens

```js
ACCENT  = "#E8C547"  // gold
BG      = "#080808"  // near black
SURFACE = "#111"     // card background
BORDER  = "rgba(255,255,255,0.08)"
TEXT    = "#F0EDE8"  // off white
MUTED   = "#666"     // secondary text
GREEN   = "#4CAF50"
RED     = "#f44336"
```

---

## Rules for Claude Code Sessions

1. Read this file first before making any changes.
2. One task per session.
3. Commit immediately after each accepted change.
4. Never rename or restructure files without updating this document.
5. The `business_expenses` table uses `expense_date` (not `date`) as the date column.
6. All order revenue queries must filter by `location_id IN (select id from locations where business_id = ?)` — orders do not have a direct `business_id` foreign key in v2.
