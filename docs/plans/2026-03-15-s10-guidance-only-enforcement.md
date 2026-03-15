---
title: S10 Guidance-Only Commercial Enforcement
date: 2026-03-15
status: implemented
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S10 Guidance-Only Commercial Enforcement

## Scope

Promote `S10` as the next documented `P4` slice after `S09`, and add canonical staff-side enforcement so guidance-only and referral-only matters cannot move into staff-led recovery or success-fee handling without reopening intake, public pricing copy, routing, auth layering, tenancy boundaries, or member-safe note isolation.

## Changes

- Moved the launch-scope category semantics into a shared `domain-claims` helper so submission-time classification and staff-side enforcement reuse the same supported-vs-outside-launch-scope contract.
- Added a dedicated staff commercial-scope guard that blocks guidance-only, referral-only, and scope-unconfirmed claims from `negotiation` or `court`, escalation-agreement saves, and success-fee collection saves on the canonical domain mutation paths.
- Extended the accepted-recovery prerequisite snapshot and the canonical staff claim-detail read model so staff can see when launch scope blocks commercial handling, including legacy accepted cases that already carry agreement or collection data.
- Updated the canonical staff action panel to surface a staff-only launch-scope restriction banner and keep commercial action controls locked while the restriction applies, without exposing new staff-only operational text to members.
- Kept the change migration-free by enforcing from the durable claim `category` field and blocking ambiguous legacy scope instead of inferring commercial eligibility.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/commercial-handling-scope.test.ts src/staff-claims/accepted-recovery-prerequisites.test.ts src/staff-claims/update-status.test.ts src/staff-claims/save-escalation-agreement.test.ts src/staff-claims/save-success-fee-collection.test.ts src/staff-claims/get-staff-claim-detail.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run 'src/components/staff/claim-action-panel.test.tsx' 'src/app/[locale]/(staff)/staff/claims/[id]/page.test.tsx'`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/claims/submit.test.ts src/components/claims/wizard-step-category.test.tsx`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm pr:verify`

## Result

Guidance-only and referral-only matters now stay out of canonical staff-led recovery and success-fee handling even if staff try to save commercial terms on them later. Staff see a specific launch-scope restriction on the routed claim-detail surface, accepted legacy cases with unsupported scope stay blocked instead of silently ready, and member-facing surfaces still do not receive staff-only enforcement detail.
