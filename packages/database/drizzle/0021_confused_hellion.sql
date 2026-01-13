CREATE TABLE "claim_counters" (
	"tenant_id" text NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "claim_counters_tenant_id_year_pk" PRIMARY KEY("tenant_id","year")
);
--> statement-breakpoint
ALTER TABLE "claim" ADD COLUMN "claim_number" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "claim_counters" ADD CONSTRAINT "claim_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;