ALTER TABLE "member_leads" ADD COLUMN "lead_kind" text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "team_size" text;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "consent_notice_version" text DEFAULT 'pre-consent-legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_leads" ALTER COLUMN "consent_notice_version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "consent_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "consent_captured_by" text;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "capture_channel" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_leads" ALTER COLUMN "capture_channel" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "member_leads" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_consent_captured_by_user_id_fk" FOREIGN KEY ("consent_captured_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_lead_kind_check" CHECK ("member_leads"."lead_kind" in ('individual', 'company'));--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_capture_channel_check" CHECK ("member_leads"."capture_channel" in ('agent_assisted', 'public_form', 'legacy'));--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_company_check" CHECK ("member_leads"."lead_kind" = 'individual' or nullif(btrim("member_leads"."company_name"), '') is not null);--> statement-breakpoint
ALTER TABLE "member_leads" ADD CONSTRAINT "member_leads_consent_check" CHECK (("member_leads"."capture_channel" = 'legacy' and "member_leads"."consent_notice_version" = 'pre-consent-legacy')
        or ("member_leads"."capture_channel" <> 'legacy' and "member_leads"."consent_captured_at" is not null
          and "member_leads"."consent_notice_version" <> 'pre-consent-legacy'
          and ("member_leads"."capture_channel" <> 'agent_assisted' or "member_leads"."consent_captured_by" is not null)));--> statement-breakpoint
-- The legacy marker exists only for rows this migration backfilled: a new lead, or an update that
-- turns a captured lead back into a legacy one, is refused, so consent cannot be skipped later.
CREATE OR REPLACE FUNCTION member_leads_legacy_consent_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."capture_channel" = 'legacy'
    AND (TG_OP = 'INSERT' OR OLD."capture_channel" IS DISTINCT FROM 'legacy') THEN
    RAISE EXCEPTION 'member_leads: legacy consent is reserved for pre-consent backfilled rows'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "member_leads_legacy_consent_guard"
BEFORE INSERT OR UPDATE OF "capture_channel" ON "member_leads"
FOR EACH ROW
EXECUTE FUNCTION member_leads_legacy_consent_guard_fn();
