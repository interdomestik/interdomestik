CREATE TABLE "seed_meta" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" text NOT NULL,
	"mode" text NOT NULL,
	"git_sha" text,
	"seed_base_time" timestamp NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"run_by" text,
	CONSTRAINT "seed_meta_singleton" CHECK ("seed_meta"."id" = 1)
);
