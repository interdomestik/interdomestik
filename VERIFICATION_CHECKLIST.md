# RBAC Verification Checklist

## 1. Automated Verification

Run the following commands to verify the invariants:

```bash
# 1. Run Unit Tests for Scope Logic
pnpm --filter web test -- apps/web/src/lib/rbac.test.ts

# 2. Run E2E Isolation Tests (requires backend running)
pnpm --filter web test:e2e -- apps/web/e2e/rbac-isolation.spec.ts
```

## 2. Manual SQL Verification

Inspect the user constraints:

```sql
-- Check if constraints exist
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'user'::regclass;
```

## 3. Deployment Checklist

- [ ] Run migration `supabase/migrations/00009_rbac_constraints.sql`.
- [ ] Verify no existing users violate the new constraints (Branch Managers with NULL branch_id will fail migration!).
- [ ] Deploy web app.
