---
title: M06 Commercial Write-Path Retirement
date: 2026-03-14
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# M06 Commercial Write-Path Retirement

## Scope

Retire the compatibility-only commercial wrapper entrypoints around the already migrated Free Start, claim submission, staff commercial action, and membership cancellation flows without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Changes

- Redirected the migrated Free Start, claim wizard, staff claim action, and membership management callers to the canonical `.core.ts` server action entrypoints.
- Removed the superseded `free-start`, `staff-claims`, `subscription`, and `memberships` wrapper modules now that no migrated commercial caller depends on them.
- Isolated the remaining non-commercial claim action surface by removing the `submitClaim` re-export from `apps/web/src/actions/claims.ts`, keeping commercial claim submission on `claims.core.ts`.
- Updated the affected unit coverage to mock the canonical `.core.ts` actions directly and added `apps/web/src/actions/commercial-write-path-retirement.test.ts` to guard against reintroducing wrapper-based commercial callers.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run src/actions/commercial-write-path-retirement.test.ts 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx' src/components/staff/claim-action-panel.test.tsx src/components/claims/claim-wizard.ui-v2.test.tsx src/features/member/membership/components/MembershipOpsPage.test.tsx src/actions/claims.test.ts src/actions/subscription.test.ts`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- `pnpm plan:audit`
- `pnpm plan:status`
- `pnpm plan:proof`

## Result

`M06` exit criteria are satisfied. Migrated commercial callers now import the canonical `.core.ts` server actions directly, the compatibility-only commercial wrapper modules are gone, and no orphaned commercial write path remains on the active surface.
