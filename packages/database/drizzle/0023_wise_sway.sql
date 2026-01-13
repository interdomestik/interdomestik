CREATE TABLE "member_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_member_number_unique";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "member_number_issued_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "user_member_number_idx" ON "user" USING btree ("member_number") WHERE role = 'member';