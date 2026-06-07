ALTER TABLE "tenants" ADD COLUMN "governing_law" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "terms_version" text;--> statement-breakpoint
UPDATE "tenants" SET "governing_law" = UPPER("country_code") WHERE "governing_law" IS NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_governing_law_check" CHECK ("tenants"."governing_law" IS NULL OR "tenants"."governing_law" ~ '^[A-Z]{2}$');
