CREATE TABLE "event_pii_references" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"event_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"reference_kind" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_pii_references_subject_type_check" CHECK (length(trim("event_pii_references"."subject_type")) > 0),
	CONSTRAINT "event_pii_references_subject_id_check" CHECK (length(trim("event_pii_references"."subject_id")) > 0),
	CONSTRAINT "event_pii_references_kind_check" CHECK (length(trim("event_pii_references"."reference_kind")) > 0),
	CONSTRAINT "event_pii_references_payload_check" CHECK (length(trim("event_pii_references"."encrypted_payload")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event_pii_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_at" timestamp with time zone,
	CONSTRAINT "event_pii_keys_ciphertext_check" CHECK (length(trim("event_pii_keys"."key_ciphertext")) > 0),
	CONSTRAINT "event_pii_keys_version_check" CHECK ("event_pii_keys"."key_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "event_pii_references" ADD CONSTRAINT "event_pii_references_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_pii_references" ADD CONSTRAINT "event_pii_references_tenant_event_fk" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."domain_events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_pii_keys" ADD CONSTRAINT "event_pii_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_pii_references_tenant_id_id_uq" ON "event_pii_references" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "event_pii_keys" ADD CONSTRAINT "event_pii_keys_tenant_reference_fk" FOREIGN KEY ("tenant_id","reference_id") REFERENCES "public"."event_pii_references"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_pii_references_tenant_event_idx" ON "event_pii_references" USING btree ("tenant_id","event_id");--> statement-breakpoint
CREATE INDEX "event_pii_references_tenant_subject_idx" ON "event_pii_references" USING btree ("tenant_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_pii_keys_tenant_reference_uq" ON "event_pii_keys" USING btree ("tenant_id","reference_id");--> statement-breakpoint
CREATE INDEX "event_pii_keys_tenant_destroyed_idx" ON "event_pii_keys" USING btree ("tenant_id","destroyed_at");--> statement-breakpoint
ALTER TABLE public."event_pii_references" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."event_pii_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'event_pii_references'
      AND policyname = 'tenant_isolation_event_pii_references'
  ) THEN
    CREATE POLICY "tenant_isolation_event_pii_references" ON public."event_pii_references"
      USING (tenant_id = (select current_setting('app.current_tenant_id', true))::text)
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true))::text);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'event_pii_keys'
      AND policyname = 'tenant_isolation_event_pii_keys'
  ) THEN
    CREATE POLICY "tenant_isolation_event_pii_keys" ON public."event_pii_keys"
      USING (tenant_id = (select current_setting('app.current_tenant_id', true))::text)
      WITH CHECK (tenant_id = (select current_setting('app.current_tenant_id', true))::text);
  END IF;
END $$;
