# PD05B: Privacy / RBAC Corrected-Baseline Re-Proof

## Purpose

Re-run the Day-5 privacy, RBAC, branch-isolation, and tenant-isolation proof on the corrected `v1.0.0` baseline.

This scenario exists because the historical pilot line stayed bounded in privacy and RBAC, but the live week also required post-hoc canonical repair in other areas. The next pilot line should re-prove boundary behavior on the corrected release state instead of relying only on carried-forward historical confidence.

## Applies To

- Pilot ID: `pilot-ks-v1-0-0-2026-03-28`
- Branch scope: `KS`
- Mode: `live`

## Required Surfaces

- `member`
- `agent`
- `staff`
- `admin`

## Boundary Questions

1. Does a member stay blocked from admin and staff surfaces?
2. Does an agent stay blocked from unauthorized member, staff, and admin surfaces?
3. Does staff stay limited to the intended claims-processing scope?
4. Does admin stay tenant-bounded?
5. Does branch scope remain bounded where branch-specific access is expected?
6. Does aggregate-only group visibility stay aggregate-only without explicit member consent?
7. Does registration and tenant attribution stay correct under host-based tenant routing?

## Minimum Checks

- canonical role isolation checks in the gate suite remain green
- no cross-tenant branch visibility
- no cross-branch claim leakage where branch scoping should apply
- no member-identifying leak in aggregate-only group access
- no tenant-attribution drift during registration or login flows

## Execution Path

Use the corrected `main` baseline that carries the final RC fixes.

Run:

```bash
pnpm pilot:check
pnpm e2e:gate
```

Then perform a short browser verification pass across the canonical KS routes:

- `/sq/member`
- `/sq/agent`
- `/sq/staff/claims`
- `/sq/admin/overview`

## Evidence To Record

Record the result in the copied evidence index for the active pilot id:

- observability row notes should reference `PD05B`
- decision row should reference the matching observability row
- executive review should summarize `PD05B` directly, not only by implication

## Pass Criteria

- no confirmed privacy breach
- no tenant-isolation breach
- no branch-isolation breach
- no aggregate-only leak
- no repeated auth bounce that breaks boundary enforcement

## Stop Criteria

Stop immediately if any of the following occurs:

- cross-tenant data exposure
- cross-branch claim exposure where branch scoping should prevent it
- member-identifying data leaks into an aggregate-only surface
- role isolation failure across canonical routes

## Expected Outcome

`PD05B` should close as a green bounded proof on the corrected `v1.0.0` release baseline. If it does not, the pilot remains bounded and must not be promoted beyond pilot scope.
