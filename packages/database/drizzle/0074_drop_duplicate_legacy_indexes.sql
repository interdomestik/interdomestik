-- Drop legacy duplicate indexes flagged by Supabase Performance Advisor.
-- The retained indexes are the canonical names declared in packages/database/src/schema.
DROP INDEX IF EXISTS public.idx_branches_tenant_id;
DROP INDEX IF EXISTS public.idx_claim_agent_id;
DROP INDEX IF EXISTS public.idx_claim_branch_id;
DROP INDEX IF EXISTS public.idx_subscriptions_agent_id;
DROP INDEX IF EXISTS public.idx_subscriptions_branch_id;
