---
title: S09 Accepted Case Prerequisites
date: 2026-03-14
status: implemented
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S09 Accepted Case Prerequisites

## Scope

Promote `S09` as the next documented `P4` slice after `S08`, and enforce accepted recovery agreement and collection-path prerequisites on the canonical staff mutation and claim-detail surfaces without reopening `S08`, routing, auth layering, tenancy boundaries, internal-note isolation, or member-safe exposure.

## Changes

- Added shared accepted-recovery prerequisite helpers that derive readiness from the canonical recovery-decision, agreement, and success-fee collection snapshots instead of introducing a parallel prerequisite model.
- Tightened the canonical staff status mutation so accepted recovery matters cannot move into `negotiation` or `court` unless the accepted decision exists, the commercial agreement snapshot is complete, and the success-fee collection path is usable.
- Tightened the commercial write path so accepted agreement rows can be completed deterministically and success-fee collection cannot be saved against an incomplete accepted agreement snapshot.
- Extended the canonical staff claim-detail read model and action panel to show accepted-case prerequisite completeness explicitly, including accepted legacy rows that still lack a collection path.
- Added deterministic gate-path browser proof on the routed staff claim-detail surface for the accepted-with-missing-collection-path state.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/accepted-recovery-prerequisites.test.ts src/staff-claims/update-status.test.ts src/staff-claims/save-escalation-agreement.test.ts src/staff-claims/save-success-fee-collection.test.ts src/staff-claims/get-staff-claim-detail.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/staff/claim-action-panel.test.tsx 'src/app/[locale]/(staff)/staff/claims/[id]/page.test.tsx'`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 NEXT_PUBLIC_BILLING_TEST_MODE=1 node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres E2E_DATABASE_URL_RLS=postgresql://postgres:postgres@127.0.0.1:54322/postgres NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/gate/accepted-recovery-prerequisites.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1 --trace=retain-on-failure --reporter=line`
- `pnpm plan:audit`
- `pnpm security:guard`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 pnpm pr:verify`

## Result

Accepted recovery cases can no longer move forward on the canonical staff mutation path without both the accepted commercial agreement snapshot and a usable success-fee collection path. Staff now see agreement-versus-collection readiness explicitly on the routed claim-detail surface, incomplete accepted legacy states render as blocked instead of silently ready, and member surfaces still avoid staff-only collection or audit detail.
