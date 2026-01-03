-- Enable RLS on Better Auth tables to prevent public access
-- These tables should generally be accessed via the Service Role (server-side authentication)

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;

-- No policies are added, implying "Deny All" for public/anon users.
-- Application access is expected to happen via Server Actions / API Routes using the Service Role.
