CREATE TABLE "commercial_action_idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint_hash" text NOT NULL,
	"response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commercial_action_idempotency" ADD CONSTRAINT "commercial_action_idempotency_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_action_idempotency" ADD CONSTRAINT "commercial_action_idempotency_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_action_idempotency_action_key_uq" ON "commercial_action_idempotency" USING btree ("action","idempotency_key");--> statement-breakpoint
CREATE INDEX "commercial_action_idempotency_tenant_idx" ON "commercial_action_idempotency" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "commercial_action_idempotency_actor_idx" ON "commercial_action_idempotency" USING btree ("actor_user_id");