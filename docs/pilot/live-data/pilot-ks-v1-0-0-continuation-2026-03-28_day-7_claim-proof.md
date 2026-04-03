# Day 7 Claim Proof Snapshot

Pilot: `pilot-ks-v1-0-0-continuation-2026-03-28`  
Day: `7`  
Date: `2026-04-03`  
Scope: `intra-day corrected-baseline proof`

## Verified production facts

- Claim `IKv79I2B_Xb9Wi-y8J952` persisted in `tenant_ks` with `branch_id = ks_branch_a` at `2026-04-03 13:39:28.444 UTC`.
- Claim `KX79DKGLiAL17yRhvF2_w` persisted in `tenant_ks` with `branch_id = ks_branch_a` at `2026-04-03 13:40:25.109 UTC`.
- `claim_stage_history` contains a public `submitted -> verification` row for `IKv79I2B_Xb9Wi-y8J952` at `2026-04-03 13:45:05.846 UTC` with note `Day 7 triage note IKv79I2B_Xb9Wi-y8J952`.
- `claim_stage_history` contains a public `submitted -> verification` row for `KX79DKGLiAL17yRhvF2_w` at `2026-04-03 13:42:24.696 UTC` with note `Day 7 triage note KX79DKGLiAL17yRhvF2_w`.
- `claim_messages` contains a public member-visible row for `IKv79I2B_Xb9Wi-y8J952` at `2026-04-03 13:45:09.828 UTC`.
- `claim_messages` contains a public member-visible row for `KX79DKGLiAL17yRhvF2_w` at `2026-04-03 13:43:42.053 UTC`.
- Corrected production deploy `dpl_GX2PAMF7CEoZoZivC1d7NZrAkNT4` is now live on the neutral-host path used for the Day 7 slice.
- `IKv79I2B_Xb9Wi-y8J952` persisted with `staff_id = golden_ks_staff`, `assigned_at = 2026-04-03 13:44:32.147 UTC`, and `assigned_by_id = golden_ks_staff`.
- `KX79DKGLiAL17yRhvF2_w` now also persists with `staff_id = golden_ks_staff`, `assigned_at = 2026-04-03 13:46:25.262 UTC`, and `assigned_by_id = golden_ks_staff`.

## Live timing proof

- First triage for `IKv79I2B_Xb9Wi-y8J952`: `00:05:37.402` after submission.
- First public member update for `IKv79I2B_Xb9Wi-y8J952`: `00:00:03.982` after first triage.
- First triage for `KX79DKGLiAL17yRhvF2_w`: `00:01:59.587` after submission.
- First public member update for `KX79DKGLiAL17yRhvF2_w`: `00:01:17.357` after first triage.

## Day-window rollup snapshot

From `pnpm exec tsx scripts/pilot/query_week1_totals.ts --pilotId pilot-ks-v1-0-0-continuation-2026-03-28 --tenantId tenant_ks --start 2026-04-03 --end 2026-04-04`:

- Total pilot claims in cohort: `2`
- Submitted claims: `2`
- Triage SLA: `2 / 2 (100.0%)`
- Update SLA: `2 / 2 (100.0%)`
- `2 Operating-Day Progression`: `2 / 2 (100.0%)`
- Claims missing triage evidence: `0`
- Claims missing public update evidence: `0`

## Current conclusion

This April 3 snapshot proves a second strong corrected-baseline day for the continuation line. The earlier assignment-persistence mismatch is corrected on production before freeze, so Day 7 is suitable for canonical freeze as `green / continue`.
