CREATE TABLE "crm_routing_assignments_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"selected_agent_id" text NOT NULL,
	"branch_id" text,
	"strategy" text NOT NULL,
	"reason_code" text NOT NULL,
	"idempotency_key" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_routing_assignments_audit_strategy_check" CHECK ("crm_routing_assignments_audit"."strategy" in ('round_robin', 'least_loaded', 'manual_only')),
	CONSTRAINT "crm_routing_assignments_audit_reason_code_check" CHECK ("crm_routing_assignments_audit"."reason_code" in ('rule_match', 'fallback_agent', 'fallback_rule'))
);
--> statement-breakpoint
CREATE TABLE "crm_routing_cursors" (
	"tenant_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"cursor_value" text NOT NULL,
	"last_idempotency_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_routing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text,
	"source" text,
	"lead_type" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"strategy" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer NOT NULL,
	"agent_pool" jsonb NOT NULL,
	"max_new_leads_per_agent_per_day" integer,
	"max_open_leads_per_agent" integer,
	"fallback_agent_id" text,
	"fallback_rule_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_routing_rules_strategy_check" CHECK ("crm_routing_rules"."strategy" in ('round_robin', 'least_loaded', 'manual_only')),
	CONSTRAINT "crm_routing_rules_priority_check" CHECK ("crm_routing_rules"."priority" >= 0),
	CONSTRAINT "crm_routing_rules_agent_pool_array_check" CHECK (jsonb_typeof("crm_routing_rules"."agent_pool") = 'array'),
	CONSTRAINT "crm_routing_rules_max_new_leads_check" CHECK ("crm_routing_rules"."max_new_leads_per_agent_per_day" is null or "crm_routing_rules"."max_new_leads_per_agent_per_day" >= 0),
	CONSTRAINT "crm_routing_rules_max_open_leads_check" CHECK ("crm_routing_rules"."max_open_leads_per_agent" is null or "crm_routing_rules"."max_open_leads_per_agent" >= 0),
	CONSTRAINT "crm_routing_rules_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_id_uq" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_selected_agent_id_user_id_fk" FOREIGN KEY ("selected_agent_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_tenant_rule_fk" FOREIGN KEY ("tenant_id","rule_id") REFERENCES "public"."crm_routing_rules"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_tenant_lead_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."crm_leads"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_assignments_audit" ADD CONSTRAINT "crm_routing_assignments_audit_tenant_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_cursors" ADD CONSTRAINT "crm_routing_cursors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_cursors" ADD CONSTRAINT "crm_routing_cursors_tenant_rule_fk" FOREIGN KEY ("tenant_id","rule_id") REFERENCES "public"."crm_routing_rules"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_rules" ADD CONSTRAINT "crm_routing_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_rules" ADD CONSTRAINT "crm_routing_rules_tenant_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_rules" ADD CONSTRAINT "crm_routing_rules_fallback_agent_id_user_id_fk" FOREIGN KEY ("fallback_agent_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_routing_rules" ADD CONSTRAINT "crm_routing_rules_tenant_fallback_rule_fk" FOREIGN KEY ("tenant_id","fallback_rule_id") REFERENCES "public"."crm_routing_rules"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_routing_assignments_audit_tenant_lead_occurred_idx" ON "crm_routing_assignments_audit" USING btree ("tenant_id","lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_routing_assignments_audit_tenant_rule_occurred_idx" ON "crm_routing_assignments_audit" USING btree ("tenant_id","rule_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_routing_assignments_audit_idempotency_uq" ON "crm_routing_assignments_audit" USING btree ("tenant_id","idempotency_key") WHERE "crm_routing_assignments_audit"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_routing_cursors_tenant_rule_uq" ON "crm_routing_cursors" USING btree ("tenant_id","rule_id");--> statement-breakpoint
CREATE INDEX "crm_routing_rules_tenant_branch_enabled_priority_idx" ON "crm_routing_rules" USING btree ("tenant_id","branch_id","enabled","priority");--> statement-breakpoint
CREATE INDEX "crm_routing_rules_tenant_active_idx" ON "crm_routing_rules" USING btree ("tenant_id","archived_at") WHERE "crm_routing_rules"."archived_at" is null;--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
  crm_table text;
BEGIN
  FOREACH crm_table IN ARRAY ARRAY[
    'crm_routing_rules',
    'crm_routing_cursors',
    'crm_routing_assignments_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', crm_table);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = crm_table
        AND policyname = 'tenant_isolation_' || crm_table
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
        'tenant_isolation_' || crm_table,
        crm_table,
        current_tenant_setting,
        current_tenant_setting
      );
    END IF;
  END LOOP;
END
$$;
