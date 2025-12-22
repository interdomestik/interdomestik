CREATE TABLE "agent_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"commission_rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"can_negotiate_rates" boolean DEFAULT false NOT NULL,
	"tier" text DEFAULT 'standard',
	"payment_method" text,
	"payment_details" jsonb DEFAULT '{}'::jsonb,
	"min_payout_amount" numeric(8, 2) DEFAULT '50.00',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp,
	CONSTRAINT "agent_settings_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_agent_id_user_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;