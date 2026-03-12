CREATE TABLE "claim_escalation_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"signed_by_user_id" text NOT NULL,
	"accepted_by_id" text NOT NULL,
	"fee_percentage" integer NOT NULL,
	"minimum_fee" numeric(10, 2) NOT NULL,
	"legal_action_cap_percentage" integer NOT NULL,
	"payment_authorization_state" text DEFAULT 'pending' NOT NULL,
	"terms_version" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD CONSTRAINT "claim_escalation_agreements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD CONSTRAINT "claim_escalation_agreements_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD CONSTRAINT "claim_escalation_agreements_signed_by_user_id_user_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD CONSTRAINT "claim_escalation_agreements_accepted_by_id_user_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_escalation_agreements_claim_uq" ON "claim_escalation_agreements" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_escalation_agreements_tenant_idx" ON "claim_escalation_agreements" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE public."claim_escalation_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_escalation_agreements'
      AND policyname = 'tenant_isolation_claim_escalation_agreements'
  ) THEN
    CREATE POLICY "tenant_isolation_claim_escalation_agreements" ON public."claim_escalation_agreements"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END
$$;
