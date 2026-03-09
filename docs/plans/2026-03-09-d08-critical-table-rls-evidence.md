---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
---

# D08 Critical Table RLS Evidence

> Status: Active supporting input. This document records the migration and verification evidence for `D08` inside `P-1` Infrastructure Debt Closure.

## Scope

`D08` required one narrow outcome:

- prove the four critical tables from the maturity inputs report `relrowsecurity = true` without reopening a repo-wide RLS rollout

The maturity inputs describe the set as `claims`, `user`, `claim_messages`, and `documents`. The canonical Postgres table name in this repo is `claim`, not `claims`.

## Migration Evidence

The required schema state already exists on merged `main`:

- [packages/database/drizzle/0016_harden_better_auth.sql](../../packages/database/drizzle/0016_harden_better_auth.sql) enables RLS on `user`
- [packages/database/drizzle/0031_enable_claim_rls.sql](../../packages/database/drizzle/0031_enable_claim_rls.sql) enables RLS on `claim` and `claim_messages`
- [packages/database/drizzle/0035_enable_tenant_rls_coverage.sql](../../packages/database/drizzle/0035_enable_tenant_rls_coverage.sql) enables RLS across tenant-scoped tables, including `documents`

No new D08 migration was required on 2026-03-09. The remaining gap was evidence and tracker reconciliation, not missing schema work.

## Focused Verification Evidence

The following commands passed on 2026-03-09 in the isolated `codex/d08-critical-table-rls` worktree:

- `node --test scripts/package-e2e-scripts.test.mjs`
- `node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/database exec tsx --test test/critical-rls-tables.test.ts`
- `pnpm db:rls:test:required`
- `pnpm plan:status`
- `pnpm plan:proof`
- `pnpm plan:audit`

Observed table-level result:

- `claim|true`
- `claim_messages|true`
- `documents|true`
- `user|true`

## Notes

- D08 resolved as stale tracker state: the narrow RLS rollout had already landed through earlier migrations
- the new [packages/database/test/critical-rls-tables.test.ts](../../packages/database/test/critical-rls-tables.test.ts) file makes the four-table proof explicit in the canonical RLS verification surface
- the broader RLS suite still proves both coverage and active tenant enforcement through [packages/database/test/rls-coverage.test.ts](../../packages/database/test/rls-coverage.test.ts) and [packages/database/test/rls-engaged.test.ts](../../packages/database/test/rls-engaged.test.ts)

## Conclusion

`D08` is complete.

The committed `P-1` tranche now has no remaining pending item.
