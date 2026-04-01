# Day 6 Claim Proof Snapshot

Pilot: `pilot-ks-v1-0-0-continuation-2026-03-28`  
Day: `6`  
Date: `2026-04-01`  
Scope: `late-day corrected-baseline proof`

## Verified production facts

- Claim `vv28_bD0sbkn-2_H8usBH` persisted in `tenant_ks` with `branch_id = ks_branch_a` at `2026-04-01 07:13:51.260209 UTC` and moved to `verification` at `2026-04-01 07:27:30.858 UTC`.
- Claim `Tl_kfpOfE2qPdXNGUj-PI` persisted in `tenant_ks` with `branch_id = ks_branch_a` at `2026-04-01 07:14:36.203024 UTC`.
- Staff assignment for `vv28_bD0sbkn-2_H8usBH` now resolves to `golden_ks_staff / Drita Gashi`.
- Staff assignment for `Tl_kfpOfE2qPdXNGUj-PI` now resolves to `golden_ks_staff / Drita Gashi`.
- `claim_stage_history` contains a public `submitted -> verification` row for `vv28_bD0sbkn-2_H8usBH` at `2026-04-01 07:27:30.858 UTC` with note `Day 6 second-claim triage started at 2026-04-01T07:27:12.907Z UTC`.
- `claim_stage_history` contains a public `submitted -> verification` row for `Tl_kfpOfE2qPdXNGUj-PI` at `2026-04-01 07:22:08.741 UTC` with note `Day 6 triage started at 2026-04-01T07:21:51.122Z UTC`.
- `claim_messages` contains a public member-visible message row `Gi-iVVMAMs6WwJxLVzRog` for `vv28_bD0sbkn-2_H8usBH` from `golden_ks_staff` at `2026-04-01 07:27:36.191632 UTC`.
- `claim_messages` contains a public member-visible message row `73hyFLuuGOg60HrjvDAJR` for `Tl_kfpOfE2qPdXNGUj-PI` from `golden_ks_staff` at `2026-04-01 07:22:14.285372 UTC`.

## Live timing proof

- First triage for `Tl_kfpOfE2qPdXNGUj-PI`: `00:07:32.538` after submission.
- First public member update for `Tl_kfpOfE2qPdXNGUj-PI`: `00:00:05.544372` after first triage.
- First triage for `vv28_bD0sbkn-2_H8usBH`: `00:13:39.598` after submission.
- First public member update for `vv28_bD0sbkn-2_H8usBH`: `00:00:05.333632` after first triage.

## Day-window rollup snapshot

From `pnpm exec tsx scripts/pilot/query_week1_totals.ts --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 --tenantId tenant_ks --start 2026-04-01 --end 2026-04-02`:

- Total pilot claims in cohort: `2`
- Submitted claims: `2`
- Triage SLA: `2 / 2 (100.0%)`
- Update SLA: `2 / 2 (100.0%)`
- `2 Operating-Day Progression`: `2 / 2 (100.0%)`
- Claims missing triage evidence: `0`
- Claims missing public update evidence: `0`

## Current conclusion

This late-day April 1 snapshot proves the corrected production baseline across both current day-window claims. It is strong enough to freeze into canonical day-6 evidence, while still falling short of a standalone expand case because the broader durability and executive-review conditions are not yet complete.
