---
title: S05 Internal Notes Isolation
date: 2026-03-14
status: implemented
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S05 Internal Notes Isolation

## Scope

Keep staff-only internal notes isolated from member-visible claim tracking and claim messaging surfaces without changing canonical routing, auth layering, tenancy boundaries, or widening into later `P4` work.

## Changes

- Hardened the canonical domain message read path so any non-staff viewer, including members and agents, receives public claim messages only. Internal messages are no longer eligible for fallback visibility by sender identity.
- Hardened the member claim tracking read model so public timeline reads stay tenant-scoped as well as `isPublic = true`, preventing staff-only history notes from crossing read-model boundaries.
- Added focused regression coverage for both query shapes and introduced a gate-lane negative Playwright spec that writes a staff internal note and asserts that the member claim detail never renders it.

## Verification

- `pnpm --filter @interdomestik/domain-communications test --run src/messages/get.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberClaimDetail.test.ts`
- `pnpm security:guard`
- `node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup`
- `NEXT_PUBLIC_BILLING_TEST_MODE=1 ./scripts/m4-gatekeeper.sh`
- `NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/gate/internal-notes-isolation.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1 --trace=retain-on-failure --reporter=line`

## Result

The `S05` code slice is implemented and the focused regressions pass. The final browser proof uses a deterministic gate-path spec that inserts a staff-only `claimStageHistory` note, loads the canonical member claim detail surface, asserts that the note never renders, and then cleans up the inserted row. That negative isolation check now passes in both `gate-ks-sq` and `gate-mk-mk`.
