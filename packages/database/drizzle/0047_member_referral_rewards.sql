CREATE TABLE "member_referral_rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"referral_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"referrer_member_id" text NOT NULL,
	"referred_member_id" text NOT NULL,
	"qualifying_event_id" text NOT NULL,
	"qualifying_event_type" text NOT NULL,
	"reward_type" text DEFAULT 'fixed' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reward_cents" integer NOT NULL,
	"reward_percent_bps" integer,
	"currency_code" text DEFAULT 'EUR' NOT NULL,
	"earned_at" timestamp DEFAULT now(),
	"approved_at" timestamp,
	"credited_at" timestamp,
	"paid_at" timestamp,
	"voided_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "member_referral_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"reward_type" text DEFAULT 'fixed' NOT NULL,
	"fixed_reward_cents" integer,
	"percent_reward_bps" integer,
	"referred_member_reward_type" text DEFAULT 'fixed' NOT NULL,
	"referred_member_fixed_reward_cents" integer,
	"referred_member_percent_reward_bps" integer,
	"settlement_mode" text DEFAULT 'credit_only' NOT NULL,
	"payout_threshold_cents" integer DEFAULT 0 NOT NULL,
	"fraud_review_enabled" boolean DEFAULT false NOT NULL,
	"currency_code" text DEFAULT 'EUR' NOT NULL,
	"qualifying_event_type" text DEFAULT 'first_paid_membership' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_id_id_uq" ON "user" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_id_id_uq" ON "subscriptions" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_tenant_id_id_uq" ON "referrals" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_referral_tenant_id_referral_id_fk" FOREIGN KEY ("tenant_id","referral_id") REFERENCES "public"."referrals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_subscription_tenant_id_subscription_id_fk" FOREIGN KEY ("tenant_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_referrer_tenant_id_referrer_member_id_fk" FOREIGN KEY ("tenant_id","referrer_member_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_referred_tenant_id_referred_member_id_fk" FOREIGN KEY ("tenant_id","referred_member_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_reward_cents_non_negative" CHECK ("reward_cents" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_reward_percent_bps_non_negative" CHECK ("reward_percent_bps" IS NULL OR "reward_percent_bps" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_reward_percent_bps_max" CHECK ("reward_percent_bps" IS NULL OR "reward_percent_bps" <= 10000);--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_reward_type_check" CHECK ("reward_type" IN ('fixed', 'percent'));--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_reward_amount_check" CHECK ((("reward_type" = 'fixed' AND "reward_percent_bps" IS NULL AND "reward_cents" IS NOT NULL) OR ("reward_type" = 'percent' AND "reward_percent_bps" IS NOT NULL AND "reward_cents" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "member_referral_rewards" ADD CONSTRAINT "member_referral_rewards_status_check" CHECK ("status" IN ('pending', 'approved', 'credited', 'paid', 'void'));--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_fixed_reward_cents_non_negative" CHECK ("fixed_reward_cents" IS NULL OR "fixed_reward_cents" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_percent_reward_bps_non_negative" CHECK ("percent_reward_bps" IS NULL OR "percent_reward_bps" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_percent_reward_bps_max" CHECK ("percent_reward_bps" IS NULL OR "percent_reward_bps" <= 10000);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_referred_fixed_reward_cents_non_negative" CHECK ("referred_member_fixed_reward_cents" IS NULL OR "referred_member_fixed_reward_cents" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_referred_percent_reward_bps_non_negative" CHECK ("referred_member_percent_reward_bps" IS NULL OR "referred_member_percent_reward_bps" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_referred_percent_reward_bps_max" CHECK ("referred_member_percent_reward_bps" IS NULL OR "referred_member_percent_reward_bps" <= 10000);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_payout_threshold_cents_non_negative" CHECK ("payout_threshold_cents" >= 0);--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_reward_type_check" CHECK ("reward_type" IN ('fixed', 'percent'));--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_reward_amount_check" CHECK ((("reward_type" = 'fixed' AND "fixed_reward_cents" IS NOT NULL AND "percent_reward_bps" IS NULL) OR ("reward_type" = 'percent' AND "percent_reward_bps" IS NOT NULL AND "fixed_reward_cents" IS NULL)));--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_referred_reward_type_check" CHECK ("referred_member_reward_type" IN ('fixed', 'percent'));--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_referred_reward_amount_check" CHECK ((("referred_member_reward_type" = 'fixed' AND "referred_member_fixed_reward_cents" IS NOT NULL AND "referred_member_percent_reward_bps" IS NULL) OR ("referred_member_reward_type" = 'percent' AND "referred_member_percent_reward_bps" IS NOT NULL AND "referred_member_fixed_reward_cents" IS NULL)));--> statement-breakpoint
ALTER TABLE "member_referral_settings" ADD CONSTRAINT "member_referral_settings_settlement_mode_check" CHECK ("settlement_mode" IN ('credit_only', 'credit_or_payout'));--> statement-breakpoint
CREATE UNIQUE INDEX "member_referral_rewards_tenant_subscription_event_uq" ON "member_referral_rewards" USING btree ("tenant_id","subscription_id","qualifying_event_type","qualifying_event_id");--> statement-breakpoint
CREATE INDEX "member_referral_rewards_tenant_idx" ON "member_referral_rewards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "member_referral_rewards_tenant_subscription_idx" ON "member_referral_rewards" USING btree ("tenant_id","subscription_id");--> statement-breakpoint
CREATE INDEX "member_referral_rewards_tenant_event_idx" ON "member_referral_rewards" USING btree ("tenant_id","qualifying_event_type","qualifying_event_id");--> statement-breakpoint
CREATE INDEX "member_referral_rewards_referral_idx" ON "member_referral_rewards" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "member_referral_rewards_referrer_idx" ON "member_referral_rewards" USING btree ("referrer_member_id");--> statement-breakpoint
CREATE INDEX "member_referral_rewards_referred_idx" ON "member_referral_rewards" USING btree ("referred_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_referral_settings_tenant_uq" ON "member_referral_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "member_referral_settings_tenant_idx" ON "member_referral_settings" USING btree ("tenant_id");
CREATE INDEX "member_referral_settings_tenant_reward_idx" ON "member_referral_settings" USING btree ("tenant_id","reward_type");
