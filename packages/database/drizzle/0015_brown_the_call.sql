CREATE TABLE "lead_payment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"paddle_checkout_id" text,
	"paddle_transaction_id" text,
	"verified_by" text,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"converted_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "membership_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"card_number" text NOT NULL,
	"qr_code_token" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "lead_payment_attempts" ADD CONSTRAINT "lead_payment_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_payment_attempts" ADD CONSTRAINT "lead_payment_attempts_lead_id_member_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."member_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_payment_attempts" ADD CONSTRAINT "lead_payment_attempts_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_agent_id_user_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_converted_user_id_user_id_fk" FOREIGN KEY ("converted_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_payments_lead" ON "lead_payment_attempts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_payments_tenant" ON "lead_payment_attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_leads_tenant" ON "member_leads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_leads_branch" ON "member_leads" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_leads_agent" ON "member_leads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_leads_status" ON "member_leads" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_leads_tenant_email" ON "member_leads" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "idx_cards_user" ON "membership_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cards_sub" ON "membership_cards" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cards_number" ON "membership_cards" USING btree ("tenant_id","card_number");--> statement-breakpoint