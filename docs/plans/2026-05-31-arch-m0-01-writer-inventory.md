---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-05-31
tracker_id: T-000
---

# ARCH-M0-01 Writer Inventory

> Status: T-000 inventory artifact for `docs/plans/architecture-finalization-tracker-2026-05-29.md`.

## Source Of Truth

`docs/plans/current-program.md` names Architecture Finalization as the active Phase C lane. `docs/plans/current-tracker.md` delegates the active architecture queue to `docs/plans/architecture-finalization-tracker-2026-05-29.md`, where `T-000` requires enumerating every `claims.status` writer before `T-001` and later transition work begins.

## Runtime Writers

| Classification       | File / function                                                                                                     | Write shape                                                                                                 | Future routing                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| canonical writer     | `packages/domain-claims/src/staff-claims/update-status.ts` / `updateClaimStatusCore` via `persistClaimStatusChange` | transactional `tx.update(claims).set({ status, updatedAt, statusUpdatedAt, ... })` plus `claimStageHistory` | Route through `transitionClaimStatus()` in T-002; preserve history/event atomicity.        |
| canonical writer     | `packages/domain-claims/src/update-claim-status.ts` / `updateClaimStatus`                                           | legacy transactional staff helper uses `tx.update(claims).set(updateData)` and inserts `claimStageHistory`  | Route through `transitionClaimStatus()` or retire if unused in T-002.                      |
| canonical writer     | `packages/domain-claims/src/claims/create.ts` / `createClaimCore`                                                   | initial `tx.insert(claims).values({ status: 'draft' })`                                                     | Keep as creation initialization unless T-002 explicitly models creation transitions.       |
| canonical writer     | `packages/domain-claims/src/claims/submit.ts` / `persistSubmittedClaim` used by `submitClaimCore`                   | initial `tx.insert(claims).values({ status: 'submitted' })`                                                 | Keep as creation initialization unless T-002 explicitly models creation transitions.       |
| legacy/direct writer | `packages/domain-claims/src/claims/status.ts` / `updateClaimStatusCore`                                             | enum-validated `db.update(claims).set({ status, updatedAt })`                                               | Route through `transitionClaimStatus()` in T-002.                                          |
| legacy/direct writer | `packages/domain-claims/src/admin-claims/update-status.ts` / `updateClaimStatusCore`                                | direct admin `db.update(claims).set({ status: newStatus, updatedAt })`                                      | Route through `transitionClaimStatus()` in T-002; this is the bypass named by the tracker. |
| legacy/direct writer | `packages/domain-claims/src/agent-claims/update-status.ts` / `updateClaimStatusCore`                                | direct `db.update(claims).set({ status })`                                                                  | Route through `transitionClaimStatus()` in T-002.                                          |
| legacy/direct writer | `packages/domain-claims/src/claims/draft.ts` / `cancelClaimCore`                                                    | member cancellation `db.update(claims).set({ status: 'rejected', updatedAt })`                              | Route through `transitionClaimStatus()` in T-002.                                          |
| legacy/direct writer | `apps/web/src/features/admin/claims/actions/ops-actions.ts` / `updateStatus`                                        | app-local admin ops `db.update(claims).set({ status: newStatus, updatedAt, statusUpdatedAt })`              | Route through `transitionClaimStatus()` in T-002 or retire behind package action.          |

## Test, Helper, And Fixture Writers

| Classification             | File / function                                                                                                       | Write shape                                                                          | Future routing                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| test/helper/fixture writer | `apps/web/e2e/gate/agent-workspace-claims-selection.spec.ts` / `resolveAccessibleClaimId`, `resolveCrossAgentClaimId` | E2E fallback `db.insert(claims).values({ status: 'submitted' })`                     | Keep as fixture setup unless T-002 adds a test factory wrapper.                                             |
| test/helper/fixture writer | `packages/database/test/rls-engaged.test.ts` / RLS integration setup                                                  | integration fixture `dbAdmin.insert(claims).values({ status: 'draft' })`             | Keep as fixture setup unless T-002 adds a test factory wrapper.                                             |
| test/helper/fixture writer | `packages/database/src/seed-golden/claims.ts` / `buildClaimsToSeed`, `seedClaims`                                     | deterministic seed statuses plus `onConflictDoUpdate({ set: { status: c.status } })` | Keep as seed fixture; use `transitionClaimStatus()` only if seed lifecycle history becomes required.        |
| test/helper/fixture writer | `packages/database/src/seed-full/claims.ts` / `seedClaimsAndFlows`                                                    | full seed statuses plus `onConflictDoUpdate({ set: { status: c.status } })`          | Keep as seed fixture; use `transitionClaimStatus()` only if seed lifecycle history becomes required.        |
| test/helper/fixture writer | `packages/database/src/seed-packs/ks-workflow-pack.ts` / `seedKsWorkflowPack`                                         | KS workflow pack status inserts plus conflict updates                                | Keep as seed fixture; use `transitionClaimStatus()` only if seed lifecycle history becomes required.        |
| test/helper/fixture writer | `scripts/ci/db-access-guard.test.mjs` / inline fixture strings                                                        | synthetic direct status update snippets for DB access guard tests                    | Keep as guard fixture.                                                                                      |
| test/helper/fixture writer | `scripts/pilot/day1_multi_seeder.ts` / `main`                                                                         | pilot seed insert to `submitted`, later update to `verification`                     | Route update through `transitionClaimStatus()` in T-002 if retained; creation insert remains fixture setup. |
| test/helper/fixture writer | `scripts/pilot/day1_run3_lifecycle.ts` / `main`                                                                       | pilot seed insert to `submitted`, later update to `resolved`                         | Route update through `transitionClaimStatus()` in T-002 if retained; creation insert remains fixture setup. |
| test/helper/fixture writer | `scripts/pilot/simulate_agent_claim.ts` / `main`                                                                      | pilot seed insert to `submitted`                                                     | Keep as fixture setup unless replaced by a test factory.                                                    |
| test/helper/fixture writer | `scripts/pilot/simulate_triage.ts` / `main`                                                                           | pilot helper update to `verification`                                                | Route through `transitionClaimStatus()` in T-002 if retained.                                               |

## Migration And Schema Defaults

| Classification            | File / reference                                           | Write shape                                               | Future routing                          |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| migration/backfill writer | `packages/database/src/schema/claims.ts` / `claims.status` | schema default `statusEnum('status').default('draft')`    | Keep as schema default.                 |
| migration/backfill writer | `packages/database/drizzle/0000_watery_rawhide_kid.sql`    | initial table default `"status" "status" DEFAULT 'draft'` | Historical migration; no T-002 routing. |
| migration/backfill writer | `supabase/migrations/archive/00001_initial_schema.sql`     | archived enum/default and trigger over status changes     | Archived migration; no T-002 routing.   |

## Guard

`scripts/check-claim-status-writers.mjs` is wired into `pnpm security:guard`. For T-000 it blocks any new direct `claims.status` writer outside this inventory. T-002 should tighten the same guard so runtime status updates are only legal inside `transitionClaimStatus()`.
