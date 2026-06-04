ALTER TABLE "claim" ADD COLUMN "case_lifecycle_state" text;--> statement-breakpoint
ALTER TABLE "claim" ADD COLUMN "recovery_lifecycle_state" text;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_case_lifecycle_state_check" CHECK ("claim"."case_lifecycle_state" is null or "claim"."case_lifecycle_state" in ('draft', 'submitted', 'verification', 'evaluation', 'recovery', 'resolved', 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_recovery_lifecycle_state_check" CHECK ("claim"."recovery_lifecycle_state" is null or "claim"."recovery_lifecycle_state" in ('not_started', 'negotiation', 'court', 'resolved', 'closed')) NOT VALID;
