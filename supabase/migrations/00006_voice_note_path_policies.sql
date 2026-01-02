-- Explicit voice-note path policies (subset of claim-evidence RLS).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members can insert own voice note objects'
  ) THEN
    CREATE POLICY "Members can insert own voice note objects" ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'claim-evidence'
        AND auth.role() = 'authenticated'
        AND name LIKE ('pii/claims/' || auth.uid() || '/voice-notes/%')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members can read own voice note objects'
  ) THEN
    CREATE POLICY "Members can read own voice note objects" ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'claim-evidence'
        AND auth.role() = 'authenticated'
        AND name LIKE ('pii/claims/' || auth.uid() || '/voice-notes/%')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members can delete own voice note objects'
  ) THEN
    CREATE POLICY "Members can delete own voice note objects" ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'claim-evidence'
        AND auth.role() = 'authenticated'
        AND name LIKE ('pii/claims/' || auth.uid() || '/voice-notes/%')
      );
  END IF;
END $$;
