-- Claim evidence storage bucket and RLS
-- Creates a private bucket for PII-tagged claim uploads with size/mime guardrails

-- Bucket (private, 10MB max, PDF/JPG/PNG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('claim-evidence', 'claim-evidence', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Ensure RLS is enabled on objects (redundant/restricted in newer Supabase versions)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Service role can manage everything
CREATE POLICY "Service role full access (claim-evidence)" ON storage.objects
  FOR ALL
  USING (bucket_id = 'claim-evidence' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'claim-evidence' AND auth.role() = 'service_role');

-- Members can upload only into their prefix (pii/claims/<uid>/...)
CREATE POLICY "Members can insert own evidence objects" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'claim-evidence'
    AND auth.role() = 'authenticated'
    AND name LIKE ('pii/claims/' || auth.uid() || '/%')
  );

-- Members can read their own objects
CREATE POLICY "Members can read own evidence objects" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'claim-evidence'
    AND auth.role() = 'authenticated'
    AND name LIKE ('pii/claims/' || auth.uid() || '/%')
  );

-- Members can delete their own objects (optional cleanup)
CREATE POLICY "Members can delete own evidence objects" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'claim-evidence'
    AND auth.role() = 'authenticated'
    AND name LIKE ('pii/claims/' || auth.uid() || '/%')
  );
