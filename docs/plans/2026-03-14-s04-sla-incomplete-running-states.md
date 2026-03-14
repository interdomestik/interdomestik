---
title: S04 SLA Incomplete Running States
date: 2026-03-14
status: completed
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S04 SLA Incomplete Running States

## Scope

Expand claim SLA tracking to distinguish `incomplete` and `running` presentation states on the canonical staff and member claim-detail surfaces without changing routing, auth, tenancy, persistence shape, or widening into later `P4` acceptance-control scope.

## Changes

- Added a derived `ClaimSlaPhase` contract so existing claim status policy can expose whether an SLA is not applicable, waiting on missing member information, or actively running without introducing a new persisted workflow state.
- Extended the member and staff claim-detail data loaders plus canonical detail surfaces to render that SLA-phase distinction, then added locale copy so the tracker and staff info panes show the same incomplete-vs-running meaning across supported languages.
- Hardened claim-submission verification by using a browser-safe client request-key helper in the member claim wizard path and tightening the smoke assertion so canonical verification now proves persisted claim creation instead of a false-positive stay on `/member/claims/new`.

## Verification

- `pnpm --filter @interdomestik/web test:unit --run src/features/claims/policy/slaPolicy.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberClaimDetail.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(staff)/staff/claims/[id]/_core.test.ts'`
- `pnpm --filter @interdomestik/web test:unit --run src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run src/components/agent/claim-info-pane.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run src/test/i18n.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/lib/client-request-id.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/claims/claim-wizard.ui-v2.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run src/components/dashboard/claims/claim-wizard.test.tsx`
- With `BETTER_AUTH_SECRET` set in the shell:
- `node scripts/run-with-default-db-url.mjs pnpm db:migrate`
- `node scripts/run-with-default-db-url.mjs pnpm seed:e2e -- --reset`
- `node scripts/run-with-default-db-url.mjs pnpm security:guard`
- `node scripts/run-with-default-db-url.mjs pnpm pr:verify`
- `node scripts/run-with-default-db-url.mjs pnpm e2e:gate`

## Result

S04 is complete. Staff and member claim detail surfaces now distinguish SLA states that are waiting for missing member information from SLA states that are actively running, while canonical repository verification remains green on the updated claim-submission path.
