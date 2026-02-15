CREATE TABLE IF NOT EXISTS "member_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
  "agent_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action,
  "member_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action,
  "type" text NOT NULL,
  "subject" text NOT NULL,
  "description" text,
  "occurred_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_activities_tenant_member_occurred_idx"
  ON "member_activities" USING btree ("tenant_id", "member_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_activities_tenant_agent_occurred_idx"
  ON "member_activities" USING btree ("tenant_id", "agent_id", "occurred_at");
--> statement-breakpoint
ALTER TABLE public."member_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_activities'
      AND policyname = 'tenant_isolation_member_activities'
  ) THEN
    CREATE POLICY "tenant_isolation_member_activities" ON public."member_activities"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END
$$;
