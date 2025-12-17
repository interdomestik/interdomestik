-- Cleanup Legacy Supabase Auth Tables to allow Drizzle Sync
-- Dropping tables from 00001 that conflict with Drizzle schema (UUID vs Text IDs)

DROP TABLE IF EXISTS "claim_timeline" CASCADE;
DROP TABLE IF EXISTS "claim_documents" CASCADE;
DROP TABLE IF EXISTS "claim_messages" CASCADE;
DROP TABLE IF EXISTS "claims" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE; -- Old users table linked to auth.users

-- Drop old types if necessary (optional, but clean)
-- DROP TYPE IF EXISTS "claim_status"; 
-- DROP TYPE IF EXISTS "claim_category";
-- Keeping types for now in case Drizzle reuses them or to avoid dependency errors in 00002 policies (though those policies are for storage, not these tables)
