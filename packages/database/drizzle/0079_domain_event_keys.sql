CREATE TABLE "domain_event_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone,
	CONSTRAINT "domain_event_keys_subject_type_check" CHECK (length(trim("domain_event_keys"."subject_type")) > 0),
	CONSTRAINT "domain_event_keys_subject_id_check" CHECK (length(trim("domain_event_keys"."subject_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "domain_event_keys" ADD CONSTRAINT "domain_event_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_keys_tenant_subject_uq" ON "domain_event_keys" USING btree ("tenant_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "domain_event_keys_tenant_erased_idx" ON "domain_event_keys" USING btree ("tenant_id","erased_at");--> statement-breakpoint
ALTER TABLE public."domain_event_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'domain_event_keys'
      AND policyname = 'tenant_isolation_domain_event_keys'
  ) THEN
    CREATE POLICY "tenant_isolation_domain_event_keys" ON public."domain_event_keys"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END $$;
