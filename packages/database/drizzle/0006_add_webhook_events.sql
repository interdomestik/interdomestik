CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"event_type" text,
	"event_id" text,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_timestamp" timestamp with time zone,
	"payload_hash" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_result" text,
	"error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_key_uq" ON "webhook_events" ("dedupe_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_id_uq" ON "webhook_events" ("provider","event_id");
--> statement-breakpoint
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events" ("received_at");
