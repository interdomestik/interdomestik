---
title: M04 Matter-Consumption Guards
date: 2026-03-13
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# M04 Matter-Consumption Guards

## Scope

Add matter-consumption guards to the canonical staff-led recovery status transition without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Changes

- Extended the domain staff claim-status core to resolve annual matter allowance from the member subscription, count current-period recovery-matter usage, and block new `negotiation` or `court` transitions when allowance is exhausted unless a staff override reason is recorded.
- Consume a claim-specific `service_usage` row exactly once when staff-led recovery begins, and carry the matter-consumption code plus any override reason into audit metadata for inspectability.
- Threaded the optional allowance override reason through the typed staff action wrappers and exposed a staff-only override textarea in the claim action panel.
- Removed the redundant truthy fallback in `scripts/sonar-scan.mjs`, which is the local fix for the remaining PR `#312` Sonar code smell.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/update-status.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/staff-claims.wrapper.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/staff/claim-action-panel.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/staff-claims/update-status.test.ts`
- `pnpm exec node --test scripts/sonar-scan.test.mjs`
- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`
- `pnpm plan:audit`
- `pnpm plan:status`
- `pnpm plan:proof`

## Result

`M04` exit criteria are satisfied. Canonical staff-led recovery now consumes and enforces annual matter allowance, blocks exhausted allowance by default, records a staff-only explicit override reason when recovery begins without available allowance, and includes the local fix for the remaining PR `#312` Sonar issue in `scripts/sonar-scan.mjs`.
