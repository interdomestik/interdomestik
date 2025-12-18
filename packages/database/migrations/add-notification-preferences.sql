-- Add user_notification_preferences table
CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "email_claim_updates" boolean DEFAULT true NOT NULL,
  "email_marketing" boolean DEFAULT false NOT NULL,
  "email_newsletter" boolean DEFAULT true NOT NULL,
  "push_claim_updates" boolean DEFAULT true NOT NULL,
  "push_messages" boolean DEFAULT true NOT NULL,
  "in_app_all" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "user_notification_preferences_user_id_unique" UNIQUE("user_id")
);

-- Add foreign key constraint
ALTER TABLE "user_notification_preferences" 
ADD CONSTRAINT "user_notification_preferences_user_id_user_id_fk" 
FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") 
ON DELETE cascade ON UPDATE no action;
