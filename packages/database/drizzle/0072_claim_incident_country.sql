ALTER TABLE "claim" ADD COLUMN "incident_country_code" text;--> statement-breakpoint
ALTER TABLE "claim" ADD COLUMN "incident_jurisdiction" text;--> statement-breakpoint
CREATE INDEX "idx_claims_tenant_incident_country" ON "claim" USING btree ("tenant_id","incident_country_code","createdAt");--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_incident_country_code_check" CHECK ("claim"."incident_country_code" is null or "claim"."incident_country_code" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_incident_jurisdiction_check" CHECK ("claim"."incident_jurisdiction" is null or "claim"."incident_jurisdiction" ~ '^country:[A-Z]{2}$');
