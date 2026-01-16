DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE "user"
    ADD CONSTRAINT "check_staff_no_branch"
    CHECK (
      (role NOT IN ('staff', 'tenant_admin')) OR (branch_id IS NULL)
    );
  END IF;
END $$;