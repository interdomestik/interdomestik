ALTER TABLE "user" ADD COLUMN "residence_country" text;--> statement-breakpoint
COMMENT ON COLUMN "user"."residence_country" IS 'User-declared residence country; distinct from tenant_id and host, used as entity-of-record selector input.';--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_residence_country_check" CHECK ("user"."residence_country" IS NULL OR "user"."residence_country" ~ '^[A-Z]{2}$');
