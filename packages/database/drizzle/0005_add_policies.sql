CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text,
	"policy_number" text,
	"analysis_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "policies_user_id_idx" ON "policies" ("user_id");
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
