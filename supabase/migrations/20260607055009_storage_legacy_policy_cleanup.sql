-- ENT storage hardening: remove legacy user-prefix storage policies left behind by
-- 00009 because the live project used read and voice note object policy names
-- that differed from the legacy names covered by the original migration.

DROP POLICY IF EXISTS "Members can read own evidence objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can read own policy objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can read own voice note objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can insert own voice note objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own voice note objects" ON storage.objects;
