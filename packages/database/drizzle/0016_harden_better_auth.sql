-- Hardening for Better Auth Tables
-- Enable RLS and deny public access to prevent data leaks via Supabase client

-- 1. Enable RLS
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;

-- 2. Create "Deny All" policies for public/anon/authenticated roles
-- These roles are used by the Client API. The backend connects as 'postgres' (service role) which bypasses this.
-- If backend used 'authenticated', we would need to add a policy for it, but typical Drizzle setups use superuser/service_role connection.

CREATE POLICY "No public access" ON "user" FOR ALL USING (false);
CREATE POLICY "No public access" ON "session" FOR ALL USING (false);
CREATE POLICY "No public access" ON "account" FOR ALL USING (false);
CREATE POLICY "No public access" ON "verification" FOR ALL USING (false);
