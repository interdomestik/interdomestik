CREATE TABLE "domain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"event_name" text NOT NULL,
	"event_version" integer NOT NULL,
	"aggregate_version" integer NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_event_version_check" CHECK ("domain_events"."event_version" >= 1),
	CONSTRAINT "domain_events_aggregate_version_check" CHECK ("domain_events"."aggregate_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_events_tenant_created_idx" ON "domain_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "domain_events_entity_idx" ON "domain_events" USING btree ("entity_type","entity_id","aggregate_version");--> statement-breakpoint
CREATE INDEX "domain_events_correlation_idx" ON "domain_events" USING btree ("correlation_id");
