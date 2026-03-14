ALTER TABLE "claim_escalation_agreements" ALTER COLUMN "signed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ALTER COLUMN "fee_percentage" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ALTER COLUMN "minimum_fee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ALTER COLUMN "legal_action_cap_percentage" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ALTER COLUMN "terms_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ALTER COLUMN "signed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "decision_type" text;--> statement-breakpoint
ALTER TABLE "claim_escalation_agreements" ADD COLUMN "decline_reason_code" text;