---
title: S08 Recovery Decision Gate
date: 2026-03-14
status: implemented
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S08 Recovery Decision Gate

## Scope

Promote `S08` as the next documented `P4` slice after `S06`, and add the explicit accept-or-decline recovery gate to the canonical staff and member claim-detail surfaces without reopening routing, auth layering, tenancy boundaries, internal-note isolation, or the later `S09` agreement-payment prerequisite work.

## Changes

- Extended the existing `claim_escalation_agreements` record instead of creating a parallel acceptance store. The schema now keeps a durable recovery decision type plus typed decline-reason taxonomy while allowing agreement-only fields to remain empty until the later commercial-term step.
- Added shared recovery-decision helpers so the canonical status mutation path, staff read model, and member read model all use the same pending, accepted, and declined semantics plus the same member-safe decline-language mapping.
- Added a dedicated staff recovery-decision action for acceptance, and tightened the canonical staff status mutation so `negotiation` and `court` are blocked until the recovery decision is explicitly accepted. The later payment-authorization and signed-agreement prerequisite remains deferred to `S09`.
- Tightened decline handling so staff rejections now require a typed decline category and store any optional staff-only explanation separately from the public member-safe decline copy. The canonical member claim detail now receives only the safe decision summary, while the canonical staff detail keeps the internal explanation visible.
- Updated the canonical staff action panel and routed staff claim detail surfaces to show pending decision state clearly, expose explicit accept and decline controls, and stop implying that agreement fields themselves are the acceptance gate.

## Verification

- `pnpm --filter @interdomestik/domain-claims test:unit --run src/staff-claims/recovery-decision.test.ts src/staff-claims/save-recovery-decision.test.ts src/staff-claims/update-status.test.ts src/staff-claims/get-staff-claim-detail.test.ts src/staff-claims/save-success-fee-collection.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/components/staff/claim-action-panel.test.tsx src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx src/features/claims/tracking/server/getMemberClaimDetail.test.ts 'src/app/[locale]/(staff)/staff/claims/[id]/page.test.tsx'`
- `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f packages/database/drizzle/0046_s08_case_acceptance_gate.sql`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 NEXT_PUBLIC_BILLING_TEST_MODE=1 node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres E2E_DATABASE_URL_RLS=postgresql://postgres:postgres@127.0.0.1:54322/postgres NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/gate/recovery-decision-visibility.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1 --trace=retain-on-failure --reporter=line`
- `pnpm plan:audit`
- `pnpm security:guard`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 pnpm pr:verify`

The local verification database in this worktree needed the matching `drizzle.__drizzle_migrations` row recorded for `0046_s08_case_acceptance_gate` after the direct SQL apply so the gatekeeper's deterministic `pnpm db:migrate` step could replay cleanly during `pnpm pr:verify`.

## Result

`S08` is now implemented as the next promoted `P4` slice after `S06`. Staff must explicitly accept or decline recovery matters before staff-led recovery starts, decline reasons are categorized, staff-only explanations remain isolated from members, and the canonical member claim detail now shows only the safe accepted-or-declined recovery state.
