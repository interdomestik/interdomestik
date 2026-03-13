---
title: M03 Commercial Idempotency
date: 2026-03-13
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# M03 Commercial Idempotency

## Scope

Add explicit idempotency protection to the canonical commercial mutation paths without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Changes

- Added a shared commercial idempotency helper that reserves request keys, fingerprints payloads, returns cached completed responses, and rejects key reuse with mismatched payloads.
- Wired the helper into the canonical typed action paths for Free Start submission, claim escalation submission, escalation agreement acceptance, and subscription cancellation.
- Updated the affected client flows to generate and reuse a stable idempotency key for a single in-flight submission attempt.
- Added a tenant-scoped persistence table for commercial action idempotency state and taught deterministic seed cleanup to remove those rows before deleting seeded users.
- Added a follow-up RLS migration so the new tenant-scoped table remains inside the repository's enforced tenant-isolation coverage contract.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run src/lib/commercial-action-idempotency.test.ts src/actions/free-start/submit.test.ts src/actions/claims/submit.test.ts src/actions/staff-claims.wrapper.test.ts src/actions/subscription.wrapper.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx' src/components/claims/claim-wizard.ui-v2.test.tsx src/components/claims/claim-wizard.test.tsx src/components/dashboard/claims/claim-wizard.test.tsx src/components/staff/claim-action-panel.test.tsx src/features/member/membership/components/MembershipOpsPage.test.tsx src/actions/claims.test.ts src/actions/subscription.test.ts src/actions/memberships.test.ts src/actions/subscription/cancel.test.ts src/actions/staff-claims/save-escalation-agreement.test.ts`
- `pnpm --filter @interdomestik/web type-check`
- `pnpm --filter @interdomestik/database type-check`
- `pnpm --filter @interdomestik/database generate`
- `pnpm db:rls:test:required`
- `pnpm plan:audit`
- `pnpm plan:status`
- `pnpm plan:proof`
- `pnpm pr:verify`
- `pnpm security:guard`
- `node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/database seed:e2e -- --reset`
- `pnpm e2e:gate`

## Result

`M03` exit criteria are satisfied. Duplicate Free Start, escalation, agreement, and cancellation submissions now reuse explicit idempotency state on the canonical commercial action paths, and the deterministic seed reset plus tenant RLS coverage remain green with the new persistence layer in place.
