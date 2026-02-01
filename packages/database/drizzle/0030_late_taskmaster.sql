ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "created_by" text DEFAULT 'self';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "assisted_by_agent_id" text;