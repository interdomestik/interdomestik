---
title: S07 Matter Allowance Visibility
date: 2026-03-14
status: implemented
owner: platform + web
tracker: docs/plans/current-tracker.md
program: docs/plans/current-program.md
---

# S07 Matter Allowance Visibility

## Scope

Add canonical matter-ledger and allowance visibility to the live `P4` claim-detail surfaces without changing routing, auth layering, tenancy boundaries, or widening into `S06`, `S08`, `S09`, or `S10`.

## Changes

- Extracted the annual matter-allowance window, plan-tier allowance lookup, and current-window usage counting from the `M04` staff recovery mutation into a shared helper so read-models and the canonical write path use the same semantics.
- Extended the canonical staff and member claim-detail read models to return allowance total, current-window consumed count, remaining count, and window bounds with strict tenant scoping and clean zero-usage behavior.
- Surfaced the allowance summary on the canonical member claim-detail ops page and on the routed staff claim-detail page. This keeps the work on live `P4` surfaces without widening into the unused alternative staff-detail branch.
- Added focused unit coverage for the shared helper and the member and staff claim-detail surfaces, plus a deterministic gate-path browser proof that asserts both roles see the same seeded allowance values.

## Verification

- `pnpm --filter @interdomestik/domain-claims test --run src/staff-claims/matter-allowance.test.ts`
- `pnpm --filter @interdomestik/domain-claims test --run src/staff-claims/get-staff-claim-detail.test.ts`
- `pnpm --filter @interdomestik/domain-claims test --run src/staff-claims/update-status.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/features/claims/tracking/server/getMemberClaimDetail.test.ts`
- `pnpm --filter @interdomestik/web test:unit --run src/features/member/claims/components/MemberClaimDetailOpsPage.test.tsx`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(staff)/staff/claims/[id]/page.test.tsx'`
- `pnpm --filter @interdomestik/web test:unit --run src/test/i18n.test.ts`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 NEXT_PUBLIC_BILLING_TEST_MODE=1 node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web build`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 NEXT_PUBLIC_BILLING_TEST_MODE=1 node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres E2E_DATABASE_URL_RLS=postgresql://postgres:postgres@127.0.0.1:54322/postgres NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web exec playwright test e2e/gate/matter-allowance-visibility.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1 --trace=retain-on-failure --reporter=line`
- `pnpm plan:audit`
- `pnpm security:guard`
- `BETTER_AUTH_SECRET=codex-local-build-secret-32-chars-minimum-123456 NEXT_PUBLIC_BILLING_TEST_MODE=1 node scripts/run-with-default-db-url.mjs pnpm pr:verify`

## Result

`S07` is implemented as the next promoted `P4` slice after `S05`, ahead of `S06`. Staff and members can now see annual matter usage and remaining allowance on the canonical claim-detail surfaces using the same allowance semantics already enforced by `M04`.
