CREATE UNIQUE INDEX "domain_events_tenant_id_id_uq" ON "domain_events" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE TABLE "domain_event_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"event_id" text NOT NULL,
	"consumer_name" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_event_deliveries_consumer_name_check" CHECK (length(trim("domain_event_deliveries"."consumer_name")) > 0),
	CONSTRAINT "domain_event_deliveries_idempotency_key_check" CHECK (length(trim("domain_event_deliveries"."idempotency_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "domain_event_deliveries" ADD CONSTRAINT "domain_event_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_event_deliveries" ADD CONSTRAINT "domain_event_deliveries_tenant_event_fk" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."domain_events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_deliveries_event_consumer_uq" ON "domain_event_deliveries" USING btree ("event_id","consumer_name");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_deliveries_idempotency_key_uq" ON "domain_event_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "domain_event_deliveries_tenant_consumer_idx" ON "domain_event_deliveries" USING btree ("tenant_id","consumer_name","delivered_at");--> statement-breakpoint
ALTER TABLE public."domain_event_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'domain_event_deliveries'
      AND policyname = 'tenant_isolation_domain_event_deliveries'
  ) THEN
    CREATE POLICY "tenant_isolation_domain_event_deliveries" ON public."domain_event_deliveries"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END $$;
