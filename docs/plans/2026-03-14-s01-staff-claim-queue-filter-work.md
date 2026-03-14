---
title: S01 Staff Claim Queue And Filter Work
date: 2026-03-14
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S01 Staff Claim Queue And Filter Work

## Scope

Keep the staff claim queue as the actionable-only staff workspace and close the queue-filter gap without changing routing, auth, tenancy, or widening into later `P4` acceptance-control scope.

## Changes

- Extended `getStaffClaimsList` with branch-aware assignment, actionable-status, and search filters while preserving the existing actionable queue scope for staff and branch-manager visibility.
- Updated `/[locale]/staff/claims` to forward `assigned`, `status`, and `search`, render queue filter controls, and surface the claim title plus company context directly in the staff queue rows.
- Added unit coverage at the page and domain boundaries, then proved the seeded staff queue filter flow in Playwright by narrowing the queue to a searched claim and opening the matching detail page.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/get-staff-claims-list.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(staff)/staff/claims/_core.entry.test.tsx'`
- `node scripts/run-with-default-db-url.mjs pnpm db:migrate`
- `node scripts/run-with-default-db-url.mjs pnpm seed:e2e -- --reset`
- `node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web run build:ci`
- `node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web test:e2e -- e2e/staff-claims-queue.spec.ts --project=gate-ks-sq --max-failures=1`
- `node scripts/run-with-default-db-url.mjs pnpm security:guard`
- `node scripts/run-with-default-db-url.mjs pnpm pr:verify`
- `node scripts/run-with-default-db-url.mjs pnpm e2e:gate`

## Result

`S01` exit criteria are satisfied. The staff queue now keeps its actionable-only scope while exposing assignment, status, and search filters with branch-aware visibility and executable browser proof.
