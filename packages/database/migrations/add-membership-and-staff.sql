-- Membership, staff handling, and agent sales foundations

DO $$
BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'paused', 'canceled', 'trialing', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE membership_tier AS ENUM ('basic', 'standard', 'family', 'business');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid', 'void');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE commission_type AS ENUM ('new_membership', 'renewal', 'upgrade', 'b2b');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS membership_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  tier membership_tier NOT NULL,
  interval text NOT NULL DEFAULT 'year',
  price numeric(8, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  members_included integer NOT NULL DEFAULT 1,
  legal_consultations_per_year integer,
  mediation_discount_percent integer NOT NULL DEFAULT 0,
  success_fee_percent integer NOT NULL DEFAULT 15,
  paddle_price_id text,
  paddle_product_id text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "claim"
  ADD COLUMN IF NOT EXISTS "staffId" text REFERENCES "user"(id),
  ADD COLUMN IF NOT EXISTS "assignedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "assignedById" text REFERENCES "user"(id);

CREATE INDEX IF NOT EXISTS claim_staff_idx ON "claim" ("staffId");

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_key text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamp,
  ADD COLUMN IF NOT EXISTS canceled_at timestamp,
  ADD COLUMN IF NOT EXISTS past_due_at timestamp,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamp,
  ADD COLUMN IF NOT EXISTS dunning_attempt_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_at timestamp;

UPDATE subscriptions
SET status = 'active'
WHERE status IS NULL;

UPDATE subscriptions
SET status = 'active'
WHERE status NOT IN ('active', 'past_due', 'paused', 'canceled', 'trialing', 'expired');

ALTER TABLE subscriptions
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE subscriptions
  ALTER COLUMN status TYPE subscription_status
  USING status::subscription_status;

ALTER TABLE subscriptions
  ALTER COLUMN status SET DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_key_fkey'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_plan_key_fkey
      FOREIGN KEY (plan_key) REFERENCES membership_plans(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions (status);

CREATE TABLE IF NOT EXISTS agent_clients (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES "user"(id),
  member_id text NOT NULL REFERENCES "user"(id),
  status text NOT NULL DEFAULT 'active',
  joined_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_clients_unique ON agent_clients (agent_id, member_id);
CREATE INDEX IF NOT EXISTS agent_clients_agent_idx ON agent_clients (agent_id);
CREATE INDEX IF NOT EXISTS agent_clients_member_idx ON agent_clients (member_id);

CREATE TABLE IF NOT EXISTS agent_commissions (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES "user"(id),
  member_id text REFERENCES "user"(id),
  subscription_id text REFERENCES subscriptions(id),
  type commission_type NOT NULL,
  status commission_status NOT NULL DEFAULT 'pending',
  amount numeric(8, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  earned_at timestamp DEFAULT now(),
  paid_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS agent_commissions_agent_idx ON agent_commissions (agent_id);
CREATE INDEX IF NOT EXISTS agent_commissions_status_idx ON agent_commissions (status);
CREATE INDEX IF NOT EXISTS agent_commissions_earned_idx ON agent_commissions (earned_at);

CREATE TABLE IF NOT EXISTS claim_stage_history (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES "claim"(id) ON DELETE CASCADE,
  from_status status,
  to_status status NOT NULL,
  changed_by_id text REFERENCES "user"(id),
  changed_by_role text,
  note text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_stage_history_claim_idx ON claim_stage_history (claim_id);
CREATE INDEX IF NOT EXISTS claim_stage_history_created_idx ON claim_stage_history (created_at);

UPDATE "user"
SET role = 'staff'
WHERE role = 'supervisor';

INSERT INTO agent_clients (id, agent_id, member_id, status, joined_at, created_at)
SELECT concat("agentId", ':', id), "agentId", id, 'active', "createdAt", now()
FROM "user"
WHERE "agentId" IS NOT NULL
ON CONFLICT (agent_id, member_id) DO NOTHING;

INSERT INTO membership_plans (
  id,
  name,
  description,
  tier,
  interval,
  price,
  currency,
  members_included,
  legal_consultations_per_year,
  mediation_discount_percent,
  success_fee_percent,
  features,
  is_active
) VALUES
  (
    'standard',
    'Standard',
    'Complete protection for individuals.',
    'standard',
    'year',
    20,
    'EUR',
    1,
    NULL,
    50,
    15,
    '[]'::jsonb,
    true
  ),
  (
    'family',
    'Familja',
    'Whole household coverage for up to 5 members.',
    'family',
    'year',
    35,
    'EUR',
    5,
    NULL,
    50,
    15,
    '[]'::jsonb,
    true
  )
ON CONFLICT (id) DO NOTHING;
