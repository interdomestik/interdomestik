CREATE TABLE "case_scoped_access_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "access_tenant_id" text NOT NULL,
  "case_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "document_classes" text[] NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by_id" text NOT NULL,
  "correlation_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "case_scoped_access_grants_document_classes_check"
    CHECK (
      coalesce(array_length("document_classes", 1), 0) > 0
      AND "document_classes" <@ ARRAY['correspondence','contract','evidence','legal','receipt']::text[]
    )
);
--> statement-breakpoint
ALTER TABLE "case_scoped_access_grants" ADD CONSTRAINT "case_scoped_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_scoped_access_grants" ADD CONSTRAINT "case_scoped_access_grants_access_tenant_id_tenants_id_fk" FOREIGN KEY ("access_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_scoped_access_grants" ADD CONSTRAINT "case_scoped_access_grants_case_id_claim_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_scoped_access_grants" ADD CONSTRAINT "case_scoped_access_grants_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_scoped_access_grants" ADD CONSTRAINT "case_scoped_access_grants_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "case_scoped_access_grants_active_uq" ON "case_scoped_access_grants" USING btree ("tenant_id","access_tenant_id","case_id","actor_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "case_scoped_access_grants_correlation_uq" ON "case_scoped_access_grants" USING btree ("tenant_id","correlation_id");
--> statement-breakpoint
CREATE INDEX "case_scoped_access_grants_access_idx" ON "case_scoped_access_grants" USING btree ("access_tenant_id","actor_id");
--> statement-breakpoint
CREATE INDEX "case_scoped_access_grants_case_idx" ON "case_scoped_access_grants" USING btree ("tenant_id","case_id");
--> statement-breakpoint
ALTER TABLE public."case_scoped_access_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  policy_name constant text := 'tenant_isolation_case_scoped_access_grants';
  read_expr constant text := '(tenant_id = (select current_setting(''app.current_access_tenant_id'', true))::text OR access_tenant_id = (select current_setting(''app.current_access_tenant_id'', true))::text)';
  write_expr constant text :=
    'tenant_id = (select current_setting(''app.current_access_tenant_id'', true))::text';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_scoped_access_grants'
      AND policyname = policy_name
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public."case_scoped_access_grants" USING (%s) WITH CHECK (%s)',
      policy_name,
      read_expr,
      write_expr
    );
  END IF;
END;
$$;
