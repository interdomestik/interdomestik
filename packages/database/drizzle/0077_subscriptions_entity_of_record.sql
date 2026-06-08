ALTER TABLE "subscriptions" ADD COLUMN "legal_tenant_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_entity" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "governing_law_snapshot" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "terms_version_accepted" text;--> statement-breakpoint
UPDATE "subscriptions" SET "legal_tenant_id" = "tenant_id" WHERE "legal_tenant_id" IS NULL;--> statement-breakpoint
UPDATE "subscriptions" s SET "governing_law_snapshot" = t."governing_law" FROM "tenants" t WHERE s."tenant_id" = t."id" AND s."governing_law_snapshot" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_legal_tenant_id_tenants_id_fk" FOREIGN KEY ("legal_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_governing_law_snapshot_check" CHECK ("subscriptions"."governing_law_snapshot" IS NULL OR "subscriptions"."governing_law_snapshot" ~ '^[A-Z]{2}$');
