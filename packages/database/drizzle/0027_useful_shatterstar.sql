ALTER TYPE "public"."document_entity_type" ADD VALUE 'payment_attempt';--> statement-breakpoint
ALTER TABLE "lead_payment_attempts" ADD COLUMN "verification_note" text;