-- Owner-approved claim evidence formats (2026-11-12).
-- Keep the bucket private and its existing policies unchanged. Safe to reapply.
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'video/mp4',
      'video/quicktime',
      'audio/webm',
      'audio/ogg'
    ]::text[]
WHERE id = 'claim-evidence';
