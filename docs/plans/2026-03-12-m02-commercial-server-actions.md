---
title: M02 Commercial Server Action Migration
date: 2026-03-12
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# M02 Commercial Server Action Migration

## Scope

Route the top commercial mutation surfaces through typed Server Action `_core.ts` validation paths without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Changes

- Added a typed public Free Start submission action with schema validation and rate limiting.
- Moved commercial escalation-request decision metadata into `submitClaimCore` so claim submission returns the authoritative server-side decision instead of relying on client heuristics.
- Updated the Free Start shell and claim wizard to consume server-validated commercial payloads before emitting analytics.
- Kept agreement acceptance and cancellation on their existing canonical `_core.ts` actions.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run src/actions/claims.test.ts src/actions/claims/submit.test.ts src/actions/free-start/submit.test.ts src/components/claims/claim-wizard.ui-v2.test.tsx 'src/app/[locale]/components/home/free-start-intake-shell.test.tsx'`
- `pnpm plan:audit`
- `pnpm plan:status`
- `pnpm plan:proof`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

## Result

`M02` exit criteria are satisfied. Free Start completion now routes through a typed Server Action, escalation request metadata is produced by `submitClaimCore`, and agreement acceptance plus cancellation remain on canonical `_core.ts` paths.
