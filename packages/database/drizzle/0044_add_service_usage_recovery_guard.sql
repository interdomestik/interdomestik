WITH ranked_usage AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY tenant_id, subscription_id, service_code
      ORDER BY used_at ASC NULLS LAST, id ASC
    ) AS row_num
  FROM "service_usage"
)
DELETE FROM "service_usage"
WHERE ctid IN (
  SELECT ctid
  FROM ranked_usage
  WHERE row_num > 1
);

CREATE UNIQUE INDEX "service_usage_tenant_subscription_code_uq"
  ON "service_usage" USING btree ("tenant_id", "subscription_id", "service_code");
