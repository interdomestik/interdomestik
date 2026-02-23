CREATE TABLE "billing_invoices" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "billing_entity" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'paddle',
  "provider_transaction_id" text NOT NULL,
  "webhook_event_id" text NOT NULL REFERENCES "webhook_events"("id"),
  "subscription_id" text REFERENCES "subscriptions"("id"),
  "event_id" text,
  "status" text NOT NULL DEFAULT 'posted',
  "amount_total" numeric(12, 2) NOT NULL,
  "currency_code" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "billing_invoices_billing_entity_chk"
    CHECK ("billing_entity" IN ('ks', 'mk', 'al'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_scope_txn_uq"
  ON "billing_invoices" ("tenant_id", "billing_entity", "provider_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_webhook_event_uq"
  ON "billing_invoices" ("webhook_event_id");
--> statement-breakpoint
CREATE INDEX "billing_invoices_tenant_entity_idx"
  ON "billing_invoices" ("tenant_id", "billing_entity");
--> statement-breakpoint
CREATE TABLE "billing_ledger_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "billing_entity" text NOT NULL,
  "invoice_id" text NOT NULL REFERENCES "billing_invoices"("id"),
  "webhook_event_id" text NOT NULL REFERENCES "webhook_events"("id"),
  "provider" text NOT NULL DEFAULT 'paddle',
  "provider_transaction_id" text NOT NULL,
  "entry_type" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency_code" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "billing_ledger_billing_entity_chk"
    CHECK ("billing_entity" IN ('ks', 'mk', 'al'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_ledger_scope_txn_entry_uq"
  ON "billing_ledger_entries" (
    "tenant_id",
    "billing_entity",
    "provider_transaction_id",
    "entry_type"
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_ledger_webhook_event_uq"
  ON "billing_ledger_entries" ("webhook_event_id");
--> statement-breakpoint
CREATE INDEX "billing_ledger_invoice_idx"
  ON "billing_ledger_entries" ("invoice_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_invoices_scope_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_tenant_id text;
  event_processing_scope_key text;
  event_provider_transaction_id text;
BEGIN
  SELECT
    "tenant_id",
    "processing_scope_key",
    "provider_transaction_id"
  INTO
    event_tenant_id,
    event_processing_scope_key,
    event_provider_transaction_id
  FROM "webhook_events"
  WHERE "id" = NEW."webhook_event_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_invoices.webhook_event_id references missing webhook event %',
      NEW."webhook_event_id";
  END IF;

  IF event_tenant_id IS NOT NULL AND event_tenant_id <> NEW."tenant_id" THEN
    RAISE EXCEPTION 'billing_invoices tenant mismatch: invoice tenant % vs webhook tenant %',
      NEW."tenant_id",
      event_tenant_id;
  END IF;

  IF event_provider_transaction_id IS NOT NULL
     AND event_provider_transaction_id <> NEW."provider_transaction_id" THEN
    RAISE EXCEPTION 'billing_invoices provider_transaction_id mismatch: invoice % vs webhook %',
      NEW."provider_transaction_id",
      event_provider_transaction_id;
  END IF;

  IF event_processing_scope_key <> ('tenant:' || NEW."tenant_id")
     AND event_processing_scope_key <> ('entity:' || NEW."billing_entity") THEN
    RAISE EXCEPTION 'billing_invoices processing scope mismatch: webhook scope % not compatible with tenant % / entity %',
      event_processing_scope_key,
      NEW."tenant_id",
      NEW."billing_entity";
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER billing_invoices_scope_guard_trg
BEFORE INSERT OR UPDATE
ON "billing_invoices"
FOR EACH ROW
EXECUTE FUNCTION billing_invoices_scope_guard_fn();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_ledger_entries_scope_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_tenant_id text;
  invoice_billing_entity text;
  invoice_provider_transaction_id text;
  event_tenant_id text;
  event_processing_scope_key text;
  event_provider_transaction_id text;
BEGIN
  SELECT
    "tenant_id",
    "billing_entity",
    "provider_transaction_id"
  INTO
    invoice_tenant_id,
    invoice_billing_entity,
    invoice_provider_transaction_id
  FROM "billing_invoices"
  WHERE "id" = NEW."invoice_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_ledger_entries.invoice_id references missing invoice %',
      NEW."invoice_id";
  END IF;

  IF invoice_tenant_id <> NEW."tenant_id"
     OR invoice_billing_entity <> NEW."billing_entity"
     OR invoice_provider_transaction_id <> NEW."provider_transaction_id" THEN
    RAISE EXCEPTION 'billing_ledger_entries scope mismatch with invoice %', NEW."invoice_id";
  END IF;

  SELECT
    "tenant_id",
    "processing_scope_key",
    "provider_transaction_id"
  INTO
    event_tenant_id,
    event_processing_scope_key,
    event_provider_transaction_id
  FROM "webhook_events"
  WHERE "id" = NEW."webhook_event_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_ledger_entries.webhook_event_id references missing webhook event %',
      NEW."webhook_event_id";
  END IF;

  IF event_tenant_id IS NOT NULL AND event_tenant_id <> NEW."tenant_id" THEN
    RAISE EXCEPTION 'billing_ledger_entries tenant mismatch: ledger tenant % vs webhook tenant %',
      NEW."tenant_id",
      event_tenant_id;
  END IF;

  IF event_provider_transaction_id IS NOT NULL
     AND event_provider_transaction_id <> NEW."provider_transaction_id" THEN
    RAISE EXCEPTION 'billing_ledger_entries provider_transaction_id mismatch: ledger % vs webhook %',
      NEW."provider_transaction_id",
      event_provider_transaction_id;
  END IF;

  IF event_processing_scope_key <> ('tenant:' || NEW."tenant_id")
     AND event_processing_scope_key <> ('entity:' || NEW."billing_entity") THEN
    RAISE EXCEPTION 'billing_ledger_entries processing scope mismatch: webhook scope % not compatible with tenant % / entity %',
      event_processing_scope_key,
      NEW."tenant_id",
      NEW."billing_entity";
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER billing_ledger_entries_scope_guard_trg
BEFORE INSERT
ON "billing_ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION billing_ledger_entries_scope_guard_fn();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_ledger_entries_append_only_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'billing_ledger_entries is append-only; % is not allowed',
    TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER billing_ledger_entries_append_only_trg
BEFORE UPDATE OR DELETE
ON "billing_ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION billing_ledger_entries_append_only_fn();
