-- P33-SEC06: Storage tenant-prefix backstop.
-- Storage RLS now matches the app's canonical object paths:
--   pii/tenants/{tenantId}/claims/...
--   pii/tenants/{tenantId}/policies/...

DO $$
DECLARE
  legacy_claim_objects bigint;
  legacy_voice_note_objects bigint;
  legacy_policy_objects bigint;
BEGIN
  SELECT count(*)
    INTO legacy_claim_objects
    FROM storage.objects
   WHERE bucket_id = 'claim-evidence'
     AND name LIKE 'pii/claims/%';

  SELECT count(*)
    INTO legacy_voice_note_objects
    FROM storage.objects
   WHERE bucket_id = 'claim-evidence'
     AND name LIKE 'pii/claims/%/voice-notes/%';

  SELECT count(*)
    INTO legacy_policy_objects
    FROM storage.objects
   WHERE bucket_id = 'policies'
     AND name LIKE 'pii/policies/%';

  RAISE NOTICE
    'SEC06 storage preflight legacy_claim_objects=%, legacy_voice_note_objects=%, legacy_policy_objects=%',
    legacy_claim_objects,
    legacy_voice_note_objects,
    legacy_policy_objects;

  IF legacy_claim_objects > 0 OR legacy_voice_note_objects > 0 OR legacy_policy_objects > 0 THEN
    RAISE EXCEPTION
      'SEC06 storage preflight failed: migrate legacy storage objects before tenant-prefix RLS backstop';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id text;
  tenant_id text;
BEGIN
  actor_id := (SELECT auth.uid())::text;

  IF actor_id IS NULL OR to_regclass('public."user"') IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE 'SELECT u.tenant_id FROM public."user" AS u WHERE u.id = $1 LIMIT 1'
    INTO tenant_id
    USING actor_id;

  RETURN tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;

DROP POLICY IF EXISTS "Members can insert own evidence objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can select own evidence objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own evidence objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can insert own voice notes" ON storage.objects;
DROP POLICY IF EXISTS "Members can select own voice notes" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own voice notes" ON storage.objects;
DROP POLICY IF EXISTS "Members can insert own policy objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can select own policy objects" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own policy objects" ON storage.objects;

CREATE POLICY "Authenticated tenant can insert claim evidence objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'claim-evidence'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pii'
  AND (storage.foldername(name))[2] = 'tenants'
  AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
  AND (storage.foldername(name))[4] = 'claims'
);

CREATE POLICY "Authenticated tenant can select claim evidence objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'claim-evidence'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pii'
  AND (storage.foldername(name))[2] = 'tenants'
  AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
  AND (storage.foldername(name))[4] = 'claims'
);

CREATE POLICY "Authenticated tenant can delete claim evidence objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'claim-evidence'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pii'
  AND (storage.foldername(name))[2] = 'tenants'
  AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
  AND (storage.foldername(name))[4] = 'claims'
);

CREATE POLICY "Authenticated tenant can insert policy objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'policies'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pii'
  AND (storage.foldername(name))[2] = 'tenants'
  AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
  AND (storage.foldername(name))[4] = 'policies'
);

CREATE POLICY "Authenticated tenant can select policy objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'policies'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pii'
  AND (storage.foldername(name))[2] = 'tenants'
  AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
  AND (storage.foldername(name))[4] = 'policies'
);

CREATE POLICY "Authenticated tenant can delete policy objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'policies'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'pii'
  AND (storage.foldername(name))[2] = 'tenants'
  AND (storage.foldername(name))[3] = (SELECT private.current_tenant_id())
  AND (storage.foldername(name))[4] = 'policies'
);
