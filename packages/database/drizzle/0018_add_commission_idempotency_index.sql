-- Migration: Add unique index for commission idempotency
-- This prevents duplicate commission payouts from webhook replays

CREATE UNIQUE INDEX IF NOT EXISTS "agent_commissions_tenant_subscription_type_uq" 
ON "agent_commissions" ("tenant_id", "subscription_id", "type");

-- Add index for faster tenant-scoped queries
CREATE INDEX IF NOT EXISTS "idx_agent_commissions_tenant_id" 
ON "agent_commissions" ("tenant_id");
