CREATE TABLE "share_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"document_ids" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "share_packs" ADD CONSTRAINT "share_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_packs" ADD CONSTRAINT "share_packs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_packs" ADD CONSTRAINT "share_packs_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_share_packs_tenant" ON "share_packs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_share_packs_entity" ON "share_packs" USING btree ("entity_type","entity_id");