CREATE TABLE "operation_results" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"command" text NOT NULL,
	"version" integer NOT NULL,
	"request_fingerprint" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_results_version_check" CHECK ("operation_results"."version" = 1),
	CONSTRAINT "operation_results_command_check" CHECK ("operation_results"."command" in ('m4.ops.assign-owner', 'm4.legacy.assign-claim', 'm4.staff.assign-claim')),
	CONSTRAINT "operation_results_fingerprint_check" CHECK ("operation_results"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "operation_results_response_check" CHECK (jsonb_typeof("operation_results"."response") = 'object' and octet_length("operation_results"."response"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "operation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "operation_results" ADD CONSTRAINT "operation_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_results" ADD CONSTRAINT "operation_results_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_results" ADD CONSTRAINT "operation_results_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "operation_results_access_tenant" ON "operation_results" AS PERMISSIVE FOR ALL TO public USING ("operation_results"."tenant_id" = public.current_access_tenant_id()) WITH CHECK ("operation_results"."tenant_id" = public.current_access_tenant_id());