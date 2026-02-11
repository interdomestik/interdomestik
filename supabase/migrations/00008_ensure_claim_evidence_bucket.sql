-- Ensure claim-evidence storage bucket exists and remains private.
-- Idempotent by design.

INSERT INTO storage.buckets (id, name, public)
VALUES ('claim-evidence', 'claim-evidence', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;
