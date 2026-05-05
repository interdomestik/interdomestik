ALTER TABLE "support_handoffs" ADD COLUMN "member_reply" text;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "member_reply_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "member_reply_response_version" integer;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_member_reply_length_check" CHECK ("support_handoffs"."member_reply" is null or char_length("support_handoffs"."member_reply") <= 1000);