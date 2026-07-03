DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim"
    WHERE ("case_lifecycle_state" IS NULL) <> ("recovery_lifecycle_state" IS NULL)
  ) THEN
    RAISE EXCEPTION
      'T-503 blocked: repair partial claim lifecycle state rows before dropping claim.status';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "claim"
    WHERE "case_lifecycle_state" IS NOT NULL
      AND "recovery_lifecycle_state" IS NOT NULL
      AND (
        "case_lifecycle_state" <> CASE ("status"::text)
          WHEN 'draft' THEN 'draft'
          WHEN 'submitted' THEN 'submitted'
          WHEN 'submitted_to_airline' THEN 'recovery'
          WHEN 'verification' THEN 'verification'
          WHEN 'evaluation' THEN 'evaluation'
          WHEN 'negotiation' THEN 'recovery'
          WHEN 'court' THEN 'recovery'
          WHEN 'resolved' THEN 'resolved'
          WHEN 'rejected' THEN 'rejected'
          ELSE 'draft'
        END
        OR "recovery_lifecycle_state" <> CASE ("status"::text)
          WHEN 'draft' THEN 'not_started'
          WHEN 'submitted' THEN 'not_started'
          WHEN 'submitted_to_airline' THEN 'submitted_to_airline'
          WHEN 'verification' THEN 'not_started'
          WHEN 'evaluation' THEN 'not_started'
          WHEN 'negotiation' THEN 'negotiation'
          WHEN 'court' THEN 'court'
          WHEN 'resolved' THEN 'resolved'
          WHEN 'rejected' THEN 'closed'
          ELSE 'not_started'
        END
      )
  ) THEN
    RAISE EXCEPTION
      'T-503 blocked: repair claim status/lifecycle mismatches before dropping claim.status';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "claim"
SET
  "case_lifecycle_state" = CASE ("status"::text)
    WHEN 'draft' THEN 'draft'
    WHEN 'submitted' THEN 'submitted'
    WHEN 'submitted_to_airline' THEN 'recovery'
    WHEN 'verification' THEN 'verification'
    WHEN 'evaluation' THEN 'evaluation'
    WHEN 'negotiation' THEN 'recovery'
    WHEN 'court' THEN 'recovery'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'rejected' THEN 'rejected'
    ELSE 'draft'
  END,
  "recovery_lifecycle_state" = CASE ("status"::text)
    WHEN 'draft' THEN 'not_started'
    WHEN 'submitted' THEN 'not_started'
    WHEN 'submitted_to_airline' THEN 'submitted_to_airline'
    WHEN 'verification' THEN 'not_started'
    WHEN 'evaluation' THEN 'not_started'
    WHEN 'negotiation' THEN 'negotiation'
    WHEN 'court' THEN 'court'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'rejected' THEN 'closed'
    ELSE 'not_started'
  END
WHERE "case_lifecycle_state" IS NULL
  AND "recovery_lifecycle_state" IS NULL;
--> statement-breakpoint
ALTER TABLE "claim" ALTER COLUMN "case_lifecycle_state" SET DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE "claim" ALTER COLUMN "case_lifecycle_state" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim" ALTER COLUMN "recovery_lifecycle_state" SET DEFAULT 'not_started';
--> statement-breakpoint
ALTER TABLE "claim" ALTER COLUMN "recovery_lifecycle_state" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_lifecycle_pair_check" CHECK (
  ("case_lifecycle_state" = 'draft' AND "recovery_lifecycle_state" = 'not_started')
  OR ("case_lifecycle_state" = 'submitted' AND "recovery_lifecycle_state" = 'not_started')
  OR (
    "case_lifecycle_state" = 'recovery'
    AND "recovery_lifecycle_state" IN ('submitted_to_airline', 'negotiation', 'court')
  )
  OR ("case_lifecycle_state" = 'verification' AND "recovery_lifecycle_state" = 'not_started')
  OR ("case_lifecycle_state" = 'evaluation' AND "recovery_lifecycle_state" = 'not_started')
  OR ("case_lifecycle_state" = 'resolved' AND "recovery_lifecycle_state" = 'resolved')
  OR ("case_lifecycle_state" = 'rejected' AND "recovery_lifecycle_state" = 'closed')
);
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_claims_status";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_claims_tenant_branch_status";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_claims_tenant_status_created";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_claims_lifecycle"
  ON "claim" USING btree ("case_lifecycle_state","recovery_lifecycle_state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_claims_tenant_branch_lifecycle"
  ON "claim" USING btree ("tenant_id","branch_id","case_lifecycle_state","recovery_lifecycle_state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_claims_tenant_lifecycle_created"
  ON "claim" USING btree ("tenant_id","case_lifecycle_state","recovery_lifecycle_state","createdAt");
--> statement-breakpoint
ALTER TABLE "claim" DROP COLUMN IF EXISTS "status";
