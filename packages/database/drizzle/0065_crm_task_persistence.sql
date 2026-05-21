CREATE TABLE "crm_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"assigned_kind" text NOT NULL,
	"assigned_actor_id" text,
	"assigned_role" text,
	"assigned_team_id" text,
	"assigned_branch_id" text,
	"assigned_tenant_id" text,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"due_at" timestamp with time zone,
	"idempotency_key" text,
	"lifecycle_version" integer DEFAULT 1 NOT NULL,
	"created_by_id" text NOT NULL,
	"created_by_role" text NOT NULL,
	"created_by_branch_id" text,
	"create_reason_code" text NOT NULL,
	"completed_at" timestamp with time zone,
	"completion_reason_code" text,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason_code" text,
	"reopened_at" timestamp with time zone,
	"reopen_reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_tasks_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "crm_tasks_subject_kind_check" CHECK ("crm_tasks"."subject_kind" in ('lead', 'deal', 'account', 'contact', 'support_handoff')),
	CONSTRAINT "crm_tasks_assigned_kind_check" CHECK ("crm_tasks"."assigned_kind" in ('unassigned', 'actor', 'role', 'team')),
	CONSTRAINT "crm_tasks_status_check" CHECK ("crm_tasks"."status" in ('pending', 'in_progress', 'completed', 'cancelled')),
	CONSTRAINT "crm_tasks_priority_check" CHECK ("crm_tasks"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "crm_tasks_created_by_role_check" CHECK ("crm_tasks"."created_by_role" in ('member', 'agent', 'staff', 'branch_manager', 'admin')),
	CONSTRAINT "crm_tasks_assigned_role_check" CHECK ("crm_tasks"."assigned_role" is null or "crm_tasks"."assigned_role" in ('agent', 'staff', 'branch_manager', 'admin')),
	CONSTRAINT "crm_tasks_create_reason_check" CHECK ("crm_tasks"."create_reason_code" in ('manual', 'follow_up', 'support_handoff', 'assistance_review', 'data_quality')),
	CONSTRAINT "crm_tasks_completion_reason_check" CHECK ("crm_tasks"."completion_reason_code" is null or "crm_tasks"."completion_reason_code" in ('resolved', 'no_longer_needed', 'duplicate', 'converted', 'manually_closed')),
	CONSTRAINT "crm_tasks_cancellation_reason_check" CHECK ("crm_tasks"."cancellation_reason_code" is null or "crm_tasks"."cancellation_reason_code" in ('not_needed', 'duplicate', 'created_in_error', 'subject_closed')),
	CONSTRAINT "crm_tasks_reopen_reason_check" CHECK ("crm_tasks"."reopen_reason_code" is null or "crm_tasks"."reopen_reason_code" in ('follow_up_required', 'incomplete', 'manually_reopened')),
	CONSTRAINT "crm_tasks_lifecycle_version_check" CHECK ("crm_tasks"."lifecycle_version" >= 1),
	CONSTRAINT "crm_tasks_assignment_shape_check" CHECK (
		(
			"crm_tasks"."assigned_kind" = 'unassigned'
			and "crm_tasks"."assigned_actor_id" is null
			and "crm_tasks"."assigned_role" is null
			and "crm_tasks"."assigned_team_id" is null
			and "crm_tasks"."assigned_branch_id" is null
			and "crm_tasks"."assigned_tenant_id" is null
		)
		or (
			"crm_tasks"."assigned_kind" = 'actor'
			and "crm_tasks"."assigned_actor_id" is not null
			and "crm_tasks"."assigned_role" is not null
			and "crm_tasks"."assigned_team_id" is null
			and ("crm_tasks"."assigned_tenant_id" is null or "crm_tasks"."assigned_tenant_id" = "crm_tasks"."tenant_id")
		)
		or (
			"crm_tasks"."assigned_kind" = 'role'
			and "crm_tasks"."assigned_actor_id" is null
			and "crm_tasks"."assigned_role" is not null
			and "crm_tasks"."assigned_team_id" is null
			and ("crm_tasks"."assigned_tenant_id" is null or "crm_tasks"."assigned_tenant_id" = "crm_tasks"."tenant_id")
		)
		or (
			"crm_tasks"."assigned_kind" = 'team'
			and "crm_tasks"."assigned_actor_id" is null
			and "crm_tasks"."assigned_role" is null
			and "crm_tasks"."assigned_team_id" is not null
			and ("crm_tasks"."assigned_tenant_id" is null or "crm_tasks"."assigned_tenant_id" = "crm_tasks"."tenant_id")
		)
	)
);
--> statement-breakpoint
CREATE TABLE "crm_task_history" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"task_id" text NOT NULL,
	"event" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason_code" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"actor_branch_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_task_history_event_check" CHECK ("crm_task_history"."event" in ('created', 'assigned', 'reassigned', 'due_updated', 'started', 'completed', 'cancelled', 'reopened')),
	CONSTRAINT "crm_task_history_from_status_check" CHECK ("crm_task_history"."from_status" is null or "crm_task_history"."from_status" in ('pending', 'in_progress', 'completed', 'cancelled')),
	CONSTRAINT "crm_task_history_to_status_check" CHECK ("crm_task_history"."to_status" in ('pending', 'in_progress', 'completed', 'cancelled')),
	CONSTRAINT "crm_task_history_reason_code_check" CHECK ("crm_task_history"."reason_code" in ('manual', 'follow_up', 'support_handoff', 'assistance_review', 'data_quality', 'manual_assignment', 'reassignment', 'workload_balance', 'due_date_changed', 'due_date_cleared', 'manual_start', 'resolved', 'no_longer_needed', 'duplicate', 'converted', 'manually_closed', 'not_needed', 'created_in_error', 'subject_closed', 'follow_up_required', 'incomplete', 'manually_reopened')),
	CONSTRAINT "crm_task_history_actor_role_check" CHECK ("crm_task_history"."actor_role" in ('member', 'agent', 'staff', 'branch_manager', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_actor_id_user_id_fk" FOREIGN KEY ("assigned_actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_tenant_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_tenant_assigned_branch_fk" FOREIGN KEY ("tenant_id","assigned_branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_tenant_created_by_branch_fk" FOREIGN KEY ("tenant_id","created_by_branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_tenant_task_fk" FOREIGN KEY ("tenant_id","task_id") REFERENCES "public"."crm_tasks"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_history" ADD CONSTRAINT "crm_task_history_tenant_actor_branch_fk" FOREIGN KEY ("tenant_id","actor_branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_tasks_tenant_idempotency_uq" ON "crm_tasks" USING btree ("tenant_id","idempotency_key") WHERE "crm_tasks"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "crm_tasks_tenant_status_due_idx" ON "crm_tasks" USING btree ("tenant_id","status","due_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_tenant_branch_status_due_idx" ON "crm_tasks" USING btree ("tenant_id","branch_id","status","due_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_tenant_subject_idx" ON "crm_tasks" USING btree ("tenant_id","subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "crm_tasks_tenant_assigned_actor_status_due_idx" ON "crm_tasks" USING btree ("tenant_id","assigned_actor_id","status","due_at");--> statement-breakpoint
CREATE INDEX "crm_task_history_tenant_task_occurred_idx" ON "crm_task_history" USING btree ("tenant_id","task_id","occurred_at");--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
  crm_table text;
BEGIN
  FOREACH crm_table IN ARRAY ARRAY[
    'crm_tasks',
    'crm_task_history'
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
--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE "crm_task_history" FROM PUBLIC;
