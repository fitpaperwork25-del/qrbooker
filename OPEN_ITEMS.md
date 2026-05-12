# QRServe v2 — Open Items

> Read this alongside ARCHITECTURE.md before every Claude Code session.
> Mark items [x] when done. Move completed items to the bottom under ## Done.

---

## P0 — Fix Now (before any new clients)

- [ ] Each business must have its own unique staff PIN — currently hardcoded `2026` for all
- [ ] Audit all RLS policies end to end — added reactively, may have gaps
- [ ] Fix broken session handling — expired magic links hang on "Loading dashboard..."
- [ ] Add email/password auth as fallback — magic link only is a single point of failure
- [ ] Delete live Stripe keys file from Desktop
- [ ] Locate and verify super admin dashboard route in codebase

---

## P1 — Before Next Client (Red Sea, Thirty Bales)

- [ ] Rename all "QRSolutions" text to "QRServe" across entire codebase and UI
- [ ] Contact Red Sea and Thirty Bales owners — get real emails, complete signups
- [ ] Clean test orders from Snelling Cafe dashboard
- [x] Build super admin dashboard — see all clients, plans, status, MRR in one place
- [ ] Add basic error logging — integrate Sentry (free tier)
- [ ] Add indexes on `orders.location_id` and `business_expenses.business_id` in Supabase
- [ ] Fix iPhone scan page — button blinks with no feedback, needs loading state
- [ ] Add soft deletes (`deleted_at`) on orders and menu items — hard deletes are permanent
- [ ] Add input validation on order amounts before they hit the database
- [ ] Protect menu item deletes when active orders reference them
- [ ] Add Terms of Service and Privacy Policy pages — required for Stripe

---

## P2 — Before 10 Clients

- [ ] Multi-business support — one auth account owning multiple businesses with switcher
- [ ] Create staging environment on Vercel (preview branch) + separate Supabase project
- [ ] Configure Supabase backups and point-in-time recovery
- [ ] Add Stripe dunning — handle failed payments automatically, notify client
- [ ] Add automated billing recovery flow
- [ ] Add subscription expiry warning emails (7 days, 3 days, day-of)
- [ ] Add client onboarding checklist inside dashboard (first-time setup steps)
- [ ] Add order confirmation / receipt to customer after placing order
- [ ] Add rate limiting on scan page — prevent order spam
- [ ] No session expiry UI — show a "session expired, log in again" screen instead of infinite spinner
- [ ] Add in-app upgrade prompt for Starter clients
- [ ] Add annual plan option in Stripe and pricing page
- [ ] Differentiate Pro vs Enterprise features in the UI

---

## P3 — Growth Phase (10+ clients)

- [ ] Internal MRR / churn / signup dashboard for Michael
- [ ] Audit log — record key actions per business for dispute resolution
- [ ] Client feedback / bug report form inside the app
- [ ] In-app changelog — notify clients when features ship
- [ ] CSV export of orders and revenue for clients
- [ ] Menu page branding — let clients set logo and accent color
- [ ] Referral / affiliate system for word-of-mouth growth
- [ ] Account pause/resume flow (instead of cancel)
- [ ] Account deletion flow with data export (GDPR)
- [ ] SLA documentation for enterprise clients
- [ ] Migrate high-value clients to isolated Supabase projects
- [ ] Consider hiring or documenting system for a second developer

---

## Done

- [x] Stripe switched to live mode
- [x] Live checkout confirmed (cs_live_ URL)
- [x] RLS hardened with owner-scoped policies
- [x] Staff PIN login at /staff-login
- [x] Order placement fixed (removed orders_table_id_fkey 409 error)
- [x] business_id added to menu_categories
- [x] Snelling menu re-seeded (60 items / 5 categories)
- [x] Vercel env vars updated
- [x] FinancialsTab built and deployed (P&L, Income Statement, Cash Flow, expense ledger)
- [x] business_expenses table created in Supabase
- [x] ARCHITECTURE.md created and committed
- [x] P6 — FinancialsTab v2: plain language KPIs (Money In/Out/What's Left), revenue bar chart by day, expense category breakdown, top selling items, Income Statement, Cash Flow Statement
