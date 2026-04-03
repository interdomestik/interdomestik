# Day 5 Claim Proof Snapshot

- Pilot ID: `pilot-ks-v1-0-0-continuation-2026-03-28`
- Date: `2026-03-31`
- Purpose: `same-day Sev3 follow-up for neutral-host KS branch attribution and Resend production credentials`

## Pre-Deploy Control

- Stale production deployment: `dpl_GtFCDLYXGiZDyxueeqfckGFsLnMh`
- Control claim: `y1oCnny4os1NeetXmbPqD`
- Created at: `2026-03-31 15:07:02 UTC`
- Result: `tenant_id = tenant_ks`, `branch_id = null`
- Interpretation: `the stale production deployment still reproduced the day-4 branch-attribution defect`

## Post-Deploy Branch Attribution Proof

- Manual production deploy after merged main: `dpl_JBv3QJu4zdbFWKjS4sov9H6vEDYx`
- Deployment created at: `2026-03-31 19:33:51 CEST`
- Proof claim: `roZ5n4nPbKzsIaxSoxZxe`
- Result: `tenant_id = tenant_ks`, `branch_id = ks_branch_a`, `agent_id = golden_ks_agent_a1`
- Interpretation: `the branch-attribution defect no longer reproduced on the corrected production code path`

## Resend Credential Proof

- Root cause: `invalid Vercel RESEND_API_KEY`
- Environments corrected: `production`, `preview`, `development`
- Validation step: `corrected production RESEND_API_KEY authenticates against Resend GET /domains with HTTP 200`
- Corrected production deployment: `dpl_ANDSmMZsQxp9og2bFF7JLmoKot7Q`
- Proof claim: `K1GFsZVlumzqzwvw-R6vg`
- Created at: `2026-03-31T16:09:11.448Z`
- Result: `tenant_id = tenant_ks`, `branch_id = ks_branch_a`, `agent_id = golden_ks_agent_a1`
- Runtime-log observation: `no fresh Resend 401 was captured in the watched post-submit window`

## Boundaries Of This Proof

- This snapshot proves the two day-4 Sev3 blockers no longer reproduce on corrected production.
- This snapshot does not create a new same-day triage or public-update denominator.
- This snapshot does not change the known `2 Operating-Day Progression Rate` weakness.
