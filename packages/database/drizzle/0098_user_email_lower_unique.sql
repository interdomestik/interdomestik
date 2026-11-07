-- ACQ-2b1: one account per mailbox across all tenants, whatever the letter case. Tenant RLS hides
-- other tenants' users from a lookup, but a unique index is enforced against every row, hidden or
-- concurrent. Existing case-folded or whitespace duplicates stop the migration for reconciliation:
-- accounts are never merged or reassigned automatically. The index folds case and surrounding
-- whitespace exactly like the pre-check, so a padded legacy email still blocks its mailbox. Kept in SQL only (like the RLS policies),
-- so the schema module in the tenant guard's pinned closure is unchanged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "user" GROUP BY lower(btrim("email")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'user: case-folded duplicate emails exist; reconcile them before 0098'
      USING ERRCODE = 'unique_violation';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" USING btree (lower(btrim("email")));
