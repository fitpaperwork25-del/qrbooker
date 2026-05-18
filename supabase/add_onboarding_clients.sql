-- Create onboarding_clients table for Stripe webhook auto-population
-- Run in Supabase SQL editor for project yizvlbupvamsietgjtys

CREATE TABLE IF NOT EXISTS onboarding_clients (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name text NOT NULL,
  owner_email   text NOT NULL DEFAULT '',
  plan          text NOT NULL DEFAULT 'starter',
  status        text NOT NULL DEFAULT 'registered',
  progress      int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_onboarding_clients_email
  ON onboarding_clients(owner_email);

CREATE INDEX IF NOT EXISTS idx_onboarding_clients_created
  ON onboarding_clients(created_at DESC);

ALTER TABLE onboarding_clients ENABLE ROW LEVEL SECURITY;

-- Service role (webhook) bypasses RLS — no policy needed for inserts.
-- Anon key (onboarding HTML tracker) can read all rows.
CREATE POLICY "anon can read onboarding_clients"
  ON onboarding_clients FOR SELECT
  TO anon
  USING (true);
