-- Backfill tenants.code from id (e.g. tenant_mk → MK, tenant_ks → KS).
-- Unique constraint already exists (migration 0024). This populates previously-NULL rows; the column remains nullable.
UPDATE "tenants"
SET "code" = UPPER(SPLIT_PART("id", '_', 2))
WHERE "code" IS NULL;
