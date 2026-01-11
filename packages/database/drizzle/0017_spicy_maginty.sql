CREATE TABLE "claim_tracking_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "idx_claim_tracking_tokens_hash_tenant" UNIQUE("tenant_id","token_hash")
);
--> statement-breakpoint
ALTER TABLE "claim_tracking_tokens" ADD CONSTRAINT "claim_tracking_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_tracking_tokens" ADD CONSTRAINT "claim_tracking_tokens_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_claim_tracking_tokens_claim" ON "claim_tracking_tokens" USING btree ("claim_id");