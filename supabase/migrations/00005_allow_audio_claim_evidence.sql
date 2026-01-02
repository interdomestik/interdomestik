-- Allow audio uploads for voice notes in the claim-evidence bucket.
-- Uses an idempotent update to avoid errors on existing buckets.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'application/pdf',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg'
]
WHERE id = 'claim-evidence';
