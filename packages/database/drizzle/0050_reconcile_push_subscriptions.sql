CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "user_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL
);

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "tenant_id" text;

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "endpoint" text;

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "p256dh" text;

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "auth" text;

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "user_agent" text;

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

ALTER TABLE "push_subscriptions"
ADD COLUMN IF NOT EXISTS "updated_at" timestamp;

UPDATE "push_subscriptions" AS p
SET "tenant_id" = u."tenant_id"
FROM "user" AS u
WHERE p."user_id" = u."id"
  AND p."tenant_id" IS NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "endpoint" SET NOT NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "p256dh" SET NOT NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "auth" SET NOT NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "push_subscriptions"
ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "push_subscriptions"
ALTER COLUMN "updated_at" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_endpoint_unique"
  UNIQUE ("endpoint");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx"
ON "push_subscriptions" ("user_id");
