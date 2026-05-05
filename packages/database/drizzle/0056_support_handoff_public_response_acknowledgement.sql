ALTER TABLE "support_handoffs" ADD COLUMN "public_response_acknowledged_at" timestamp;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "public_response_acknowledged_by_id" text;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "public_response_acknowledged_version" integer;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_public_response_acknowledged_by_id_user_id_fk" FOREIGN KEY ("public_response_acknowledged_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
