ALTER TABLE "user" ADD COLUMN "created_by" text DEFAULT 'self';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "assisted_by_agent_id" text;