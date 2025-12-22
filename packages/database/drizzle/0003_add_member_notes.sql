CREATE TYPE "public"."note_type" AS ENUM('call', 'meeting', 'email', 'general', 'follow_up', 'issue');--> statement-breakpoint
CREATE TABLE "member_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"author_id" text NOT NULL,
	"type" "note_type" DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"follow_up_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;