CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"action_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_campaign_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text,
	"type" text NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "engagement_email_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text,
	"template_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nps_survey_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text,
	"dedupe_key" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nps_survey_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaign_logs_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "email_campaign_logs"
      ADD CONSTRAINT "email_campaign_logs_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_logs_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "automation_logs"
      ADD CONSTRAINT "automation_logs_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_logs_subscription_id_subscriptions_id_fk'
  ) THEN
    ALTER TABLE "automation_logs"
      ADD CONSTRAINT "automation_logs_subscription_id_subscriptions_id_fk"
      FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engagement_email_sends_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "engagement_email_sends"
      ADD CONSTRAINT "engagement_email_sends_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engagement_email_sends_subscription_id_subscriptions_id_fk'
  ) THEN
    ALTER TABLE "engagement_email_sends"
      ADD CONSTRAINT "engagement_email_sends_subscription_id_subscriptions_id_fk"
      FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nps_survey_tokens_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "nps_survey_tokens"
      ADD CONSTRAINT "nps_survey_tokens_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nps_survey_tokens_subscription_id_subscriptions_id_fk'
  ) THEN
    ALTER TABLE "nps_survey_tokens"
      ADD CONSTRAINT "nps_survey_tokens_subscription_id_subscriptions_id_fk"
      FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nps_survey_responses_token_id_nps_survey_tokens_id_fk'
  ) THEN
    ALTER TABLE "nps_survey_responses"
      ADD CONSTRAINT "nps_survey_responses_token_id_nps_survey_tokens_id_fk"
      FOREIGN KEY ("token_id") REFERENCES "public"."nps_survey_tokens"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nps_survey_responses_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "nps_survey_responses"
      ADD CONSTRAINT "nps_survey_responses_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nps_survey_responses_subscription_id_subscriptions_id_fk'
  ) THEN
    ALTER TABLE "nps_survey_responses"
      ADD CONSTRAINT "nps_survey_responses_subscription_id_subscriptions_id_fk"
      FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "engagement_email_sends_dedupe_key_uq" ON "engagement_email_sends" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_email_sends_user_id_idx" ON "engagement_email_sends" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_email_sends_subscription_id_idx" ON "engagement_email_sends" ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_email_sends_created_at_idx" ON "engagement_email_sends" ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nps_survey_tokens_dedupe_key_uq" ON "nps_survey_tokens" ("dedupe_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nps_survey_tokens_token_uq" ON "nps_survey_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nps_survey_tokens_user_id_idx" ON "nps_survey_tokens" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nps_survey_tokens_subscription_id_idx" ON "nps_survey_tokens" ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nps_survey_tokens_created_at_idx" ON "nps_survey_tokens" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nps_survey_responses_user_id_idx" ON "nps_survey_responses" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nps_survey_responses_subscription_id_idx" ON "nps_survey_responses" ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nps_survey_responses_created_at_idx" ON "nps_survey_responses" ("created_at");
