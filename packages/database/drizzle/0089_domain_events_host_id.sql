ALTER TABLE public."domain_events" ADD COLUMN IF NOT EXISTS "host_id" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'domain_events_host_id_check'
  ) THEN
    ALTER TABLE public."domain_events"
      ADD CONSTRAINT "domain_events_host_id_check"
      CHECK ("host_id" IS NULL OR "host_id" IN ('tenant_mk', 'tenant_ks', 'tenant_al', 'pilot-mk'));
  END IF;
END $$;
