ALTER TABLE "member_leads" ADD COLUMN "next_step_at" timestamp;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "next_step_note" text;--> statement-breakpoint
CREATE INDEX "idx_member_leads_next_step" ON "member_leads" USING btree ("tenant_id","agent_id","next_step_at");