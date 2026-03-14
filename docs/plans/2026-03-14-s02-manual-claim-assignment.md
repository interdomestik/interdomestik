---
title: S02 Manual Claim Assignment
date: 2026-03-14
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S02 Manual Claim Assignment

## Scope

Start the `P4` assignment work with explicit manual staff assignment only, keeping routing, auth, tenancy, and the existing queue scope intact while deferring any load-based auto-assignment logic.

## Changes

- Extended the canonical staff assignment mutation so staff can assign or reassign claims manually to in-scope staff members while preserving existing tenant and branch guardrails, audit logging, and self-assignment compatibility.
- Updated the canonical `/[locale]/staff/claims/[id]` detail page and staff action panel to load assignable staff options and persist a selected assignee from a dedicated manual assignment control.
- Added unit coverage for manual reassignment rules and the staff action panel, plus seeded browser coverage proving that a staff user can change the claim assignee from the staff detail page and see the persisted selection reflected after refresh.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/assign.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/staff/claim-action-panel.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/staff-claims/assign.core.audit.test.ts`
- `node scripts/run-with-default-db-url.mjs pnpm db:migrate`
- `node scripts/run-with-default-db-url.mjs pnpm seed:e2e -- --reset`
- `node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web run build:ci`
- `node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web test:e2e -- e2e/staff-claim-assignment.spec.ts --project=gate-ks-sq --max-failures=1`
- `node scripts/run-with-default-db-url.mjs pnpm security:guard`
- `node scripts/run-with-default-db-url.mjs pnpm pr:verify`
- `node scripts/run-with-default-db-url.mjs pnpm e2e:gate`

## Result

`S02` exit criteria are satisfied. Staff can now assign claims manually from the canonical detail surface, while load-based auto-assignment remains deferred.

Gate verification passed on rerun. The first `e2e:gate` attempt hit a non-reproducible `gate-mk-mk` timeout in `member-home-cta.spec.ts`; the isolated spec passed immediately afterward, and the full rerun completed with `82 passed`.
