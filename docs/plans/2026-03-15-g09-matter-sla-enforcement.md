# G09 Matter And SLA Enforcement

## Goal

Extend the scripted `P6` release gate so release-candidate runs prove the canonical member and staff claim-detail surfaces still expose:

- the seeded annual matter allowance counters
- the seeded SLA state for a running claim
- the seeded SLA state for a waiting-on-member claim

## Scope

- keep the work inside `scripts/release-gate`
- reuse the existing canonical claim-detail pages
- use deterministic seeded claim IDs from the golden KS seed
- avoid route, auth, tenant, or write-path changes

## Deterministic Surfaces

- member running SLA: `/member/claims/golden_ks_a_claim_05`
- member incomplete SLA: `/member/claims/golden_ks_a_claim_13`
- staff running SLA: `/staff/claims/golden_ks_a_claim_05`
- staff incomplete SLA: `/staff/claims/golden_ks_a_claim_13`

## Enforcement Contract

- member detail must show matter allowance `used=0`, `remaining=2`, `total=2`
- staff detail must show matter allowance `used=0`, `remaining=2`, `total=2`
- member running SLA copy must remain `Response timer is running.`
- member incomplete SLA copy must remain `Waiting for your information before the SLA starts.`
- staff running SLA copy must remain `Running`
- staff incomplete SLA copy must remain `Waiting for member information`

## Implementation Notes

- added `G09` to the `P6` release-gate suite and the all-suite manifest
- added deterministic `G09` scenario definitions and matter-allowance mismatch helpers
- added a dedicated `runG09()` gate step and RC report section
- updated the release-gate template and live program/tracker entries

## Verification

- `pnpm test:release-gate`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm e2e:gate`
- `pnpm pr:verify`
