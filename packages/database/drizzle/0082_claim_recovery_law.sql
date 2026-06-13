ALTER TABLE "claim" ADD COLUMN "recovery_law" text;--> statement-breakpoint
ALTER TABLE "claim" ADD COLUMN "recovery_legal_tenant_id" text;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_recovery_legal_tenant_id_tenants_id_fk" FOREIGN KEY ("recovery_legal_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_recovery_law_check" CHECK ("claim"."recovery_law" is null or "claim"."recovery_law" ~ '^[A-Z]{2}$');
