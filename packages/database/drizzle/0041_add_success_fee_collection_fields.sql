ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_recovered_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_currency_code" text;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_collection_method" text;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_deduction_allowed" boolean;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_has_stored_payment_method" boolean;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_invoice_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_resolved_by_id" text;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "success_fee_subscription_id" text;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD CONSTRAINT "claim_escalation_agreements_success_fee_resolved_by_id_user_id_fk" FOREIGN KEY ("success_fee_resolved_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD CONSTRAINT "claim_escalation_agreements_success_fee_subscription_id_subscriptions_id_fk" FOREIGN KEY ("success_fee_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;