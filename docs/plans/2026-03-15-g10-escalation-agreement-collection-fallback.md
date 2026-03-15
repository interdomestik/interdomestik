# G10 Escalation Agreement And Collection Fallback

## Goal

Extend the scripted `P6` release gate so release-candidate runs prove the canonical staff claim-detail surface still enforces accepted-case agreement readiness and the seeded success-fee collection fallback paths.

## Scope

- keep the work inside `scripts/release-gate`
- reuse the existing canonical staff claim-detail page
- use deterministic accepted-case claim IDs from the golden KS seed
- avoid route, auth, tenant, or write-path changes outside deterministic seed support

## Deterministic Surfaces

- unsigned accepted-case agreement blocked: `/staff/claims/golden_ks_a_claim_14`
- signed deduction path: `/staff/claims/golden_ks_a_claim_15`
- signed invoice fallback: `/staff/claims/golden_ks_a_claim_16`
- signed stored-payment-method fallback: `/staff/claims/golden_ks_a_claim_17`

## Enforcement Contract

- unsigned accepted recovery must keep `staff-accepted-recovery-prerequisites` visible with `Agreement` and `Collection path` both marked `Missing`
- signed accepted recovery must keep `staff-escalation-agreement-summary` visible
- deduction-ready accepted recovery must keep `staff-success-fee-collection-summary` visible with `Deduct from payout`
- stored-payment-method fallback must keep `staff-success-fee-collection-summary` visible with `Charge stored payment method`
- invoice fallback must keep `staff-success-fee-collection-summary` visible with `Invoice fallback`

## Implementation Notes

- added `G10` to the `P6` release-gate suite and the all-suite manifest
- seeded deterministic accepted-case escalation agreements for blocked, deduction, invoice, and stored-payment-method paths
- added a dedicated `runG10()` gate step plus report and template coverage
- added a direct staff claim-action-panel regression for the invoice fallback summary
- updated the live program and tracker entries

## Verification

- `pnpm test:release-gate`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm security:guard`
- `pnpm e2e:gate`
- `pnpm pr:verify`
