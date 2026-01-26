CREATE TABLE "member_followups" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"due_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_followups" ADD CONSTRAINT "member_followups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_followups" ADD CONSTRAINT "member_followups_agent_id_user_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_followups" ADD CONSTRAINT "member_followups_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_member_followups_tenant" ON "member_followups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_member_followups_agent" ON "member_followups" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_member_followups_member" ON "member_followups" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_member_followups_status" ON "member_followups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_member_followups_due" ON "member_followups" USING btree ("due_at");