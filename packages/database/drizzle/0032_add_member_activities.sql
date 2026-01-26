CREATE TABLE "member_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"member_id" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"occurred_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_agent_id_user_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_member_activities_tenant" ON "member_activities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_member_activities_agent" ON "member_activities" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_member_activities_member" ON "member_activities" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_member_activities_occurred" ON "member_activities" USING btree ("occurred_at");
