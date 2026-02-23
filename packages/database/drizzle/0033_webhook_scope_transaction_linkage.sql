ALTER TABLE "webhook_events" ADD COLUMN "processing_scope_key" text;
--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "provider_transaction_id" text;
--> statement-breakpoint
UPDATE "webhook_events"
SET "processing_scope_key" = CASE
  WHEN "tenant_id" IS NOT NULL THEN 'tenant:' || "tenant_id"
  ELSE 'global'
END
WHERE "processing_scope_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "processing_scope_key" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "webhook_events_provider_event_id_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_scope_event_id_uq"
  ON "webhook_events" ("provider", "processing_scope_key", "event_id")
  WHERE "event_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_scope_transaction_id_uq"
  ON "webhook_events" ("provider", "processing_scope_key", "provider_transaction_id")
  WHERE "provider_transaction_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_processing_scope_key_idx"
  ON "webhook_events" ("processing_scope_key");
