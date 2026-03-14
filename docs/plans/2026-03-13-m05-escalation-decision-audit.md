---
title: M05 Escalation Decision Audit
date: 2026-03-13
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# M05 Escalation Decision Audit

## Scope

Add audit-safe escalation acceptance and decline handling to the canonical staff claim actions without changing routing, auth, tenancy, or `apps/web/src/proxy.ts`.

## Changes

- Extended the escalation-agreement domain model, database schema, and migration set so acceptance now stores the resulting next state plus the staff decision reason in the durable agreement record alongside the actor and acceptance timestamp.
- Updated the canonical agreement save path to validate and persist the decision fields, refresh acceptance actor and time on resave, and emit acceptance audit metadata with `decisionType`, `decisionNextStatus`, and `decisionReason`.
- Extended the typed web action surface so staff tooling can submit the new decision fields end to end.
- Tightened the canonical reject path so staff decline decisions now require a reason and record `decisionType`, `decisionNextStatus`, and `decisionReason` in claim audit metadata.
- Added the staff-panel controls and summaries required to capture and display the accepted next state and decision reason on the same canonical claim action surface.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/save-escalation-agreement.test.ts src/staff-claims/update-status.test.ts src/staff-claims/get-staff-claim-detail.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/actions/staff-claims/save-escalation-agreement.test.ts src/actions/staff-claims.wrapper.test.ts src/components/staff/claim-action-panel.test.tsx`
- `pnpm --filter @interdomestik/database generate`
- `pnpm security:guard`
- `pnpm pr:verify`
- `pnpm e2e:gate`
- `pnpm plan:audit`
- `pnpm plan:status`
- `pnpm plan:proof`

## Result

`M05` exit criteria are satisfied. Canonical escalation acceptance and decline decisions now record actor, decision time, reason, and resulting next state on the staff action path, and the schema migration keeps that decision state durable and inspectable.
