---
title: S03 Claim Stage History And Member-Visible Tracker
date: 2026-03-14
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S03 Claim Stage History And Member-Visible Tracker

## Scope

Keep claim stage history as the canonical lifecycle log and preserve the member-visible `/member/claims/[id]` tracker without changing routing, auth, tenancy, or widening into later `P4` SLA-state or acceptance-control scope.

## Changes

- Recorded the initial public `submitted` stage-history event on canonical claim submission so freshly filed claims persist a member-visible lifecycle start.
- Added member tracker fallback logic so `/member/claims/[id]` still returns a public timeline when older claims have no durable public stage-history rows, while preserving the seeded `createdAt`/current-status chronology.
- Revalidated member tracker list and detail paths whenever staff publish claim status changes, then covered the S03 behavior with focused unit tests plus the canonical repository verification lanes.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/claims/submit.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberClaimDetail.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/staff-claims/update-status.core.audit.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/staff-claims/update-status.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/claims.test.ts`
- `node scripts/run-with-default-db-url.mjs pnpm db:migrate`
- `node scripts/run-with-default-db-url.mjs pnpm seed:e2e -- --reset`
- `node scripts/run-with-default-db-url.mjs pnpm security:guard`
- `node scripts/run-with-default-db-url.mjs pnpm pr:verify`
- `node scripts/run-with-default-db-url.mjs pnpm e2e:gate`

## Result

S03 is complete. Claim submission now creates the first public stage-history row, member claim detail keeps a public tracker visible for newly submitted and legacy-history claims, and staff status updates refresh the member-visible tracker without widening into later `P4` acceptance-control scope.
