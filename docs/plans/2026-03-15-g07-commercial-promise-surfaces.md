# G07 Commercial Promise Surfaces

> Status: Completed on 2026-03-15. This is supporting implementation evidence, not the live program source of truth.

## Goal

Prove in the scripted release-candidate gate that the published commercial promise surfaces still expose the coverage matrix, fee calculator, disclaimers, and refund-terms contract before broader `P6` staging validation widens.

## Scope

- extend the scripted release-gate runner with a dedicated `G07` check
- validate the canonical commercial surfaces already published on:
  - `/pricing`
  - `/register`
  - `/services`
  - `/member/membership`
- keep the check inside the existing release-gate report and GO or NO-GO verdict path
- add focused unit coverage for the runner helpers and report output
- add contract-level surface tests for the `data-testid` markers that the new RC check depends on

## Notes

- no routing, auth, tenancy, or `apps/web/src/proxy.ts` changes
- no new commercial copy or business-policy changes; this slice validates already-published surfaces
- the member membership surface makes `G07` login-dependent so RC misconfigurations still fail closed

## Verification

- `pnpm test:release-gate`
- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(site)/pricing/_core.entry.test.tsx' 'src/app/[locale]/(site)/services/page.test.tsx' 'src/features/member/membership/components/MembershipOpsPage.test.tsx'`
