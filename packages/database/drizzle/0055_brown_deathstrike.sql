ALTER TABLE "support_handoffs" ADD COLUMN "public_response" text;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "public_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "public_response_by_id" text;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "public_response_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_public_response_by_id_user_id_fk" FOREIGN KEY ("public_response_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_public_response_length_check" CHECK ("support_handoffs"."public_response" is null or char_length("support_handoffs"."public_response") <= 1000);