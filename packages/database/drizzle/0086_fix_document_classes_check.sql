-- Fix empty-array CHECK: array_length(ARRAY[]::text[], 1) returns NULL in PostgreSQL,
-- so the old constraint did not reject empty arrays. cardinality([]) returns 0, so the
-- new constraint correctly rejects them.
ALTER TABLE "case_scoped_access_grants"
  DROP CONSTRAINT IF EXISTS "case_scoped_access_grants_document_classes_check";
ALTER TABLE "case_scoped_access_grants"
  ADD CONSTRAINT "case_scoped_access_grants_document_classes_check"
  CHECK (
    cardinality("document_classes") > 0
    AND "document_classes" <@ array['correspondence','contract','evidence','legal','receipt']::text[]
  );
