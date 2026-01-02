-- Policies storage bucket and RLS
-- Private bucket for policy documents stored under pii/policies/<uid>/...

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'policies',
  'policies',
  false,
  15000000,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role full access (policies)'
  ) THEN
    CREATE POLICY "Service role full access (policies)" ON storage.objects
      FOR ALL
      USING (bucket_id = 'policies' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'policies' AND auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members can insert own policy objects'
  ) THEN
    CREATE POLICY "Members can insert own policy objects" ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'policies'
        AND auth.role() = 'authenticated'
        AND name LIKE ('pii/policies/' || auth.uid() || '/%')
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
      AND policyname = 'Members can read own policy objects'
  ) THEN
    CREATE POLICY "Members can read own policy objects" ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'policies'
        AND auth.role() = 'authenticated'
        AND name LIKE ('pii/policies/' || auth.uid() || '/%')
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
      AND policyname = 'Members can delete own policy objects'
  ) THEN
    CREATE POLICY "Members can delete own policy objects" ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'policies'
        AND auth.role() = 'authenticated'
        AND name LIKE ('pii/policies/' || auth.uid() || '/%')
      );
  END IF;
END $$;
