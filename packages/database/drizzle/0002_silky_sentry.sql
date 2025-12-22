ALTER TABLE "user" ADD COLUMN "member_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_member_number_unique" UNIQUE("member_number");