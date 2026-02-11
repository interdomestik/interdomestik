-- Ensure claim-evidence storage bucket exists and remains private.
-- Idempotent by design.

INSERT INTO storage.buckets (name, public)
VALUES ('claim-evidence', false)
ON CONFLICT (name) DO UPDATE
SET public = EXCLUDED.public;
