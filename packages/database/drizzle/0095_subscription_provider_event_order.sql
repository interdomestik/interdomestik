ALTER TABLE "subscriptions" ADD COLUMN "provider_event_occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_event_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_provider_event_order_check" CHECK (("subscriptions"."provider_event_occurred_at" IS NULL) = ("subscriptions"."provider_event_id" IS NULL));
