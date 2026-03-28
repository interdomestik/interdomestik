# PD05B — Privacy / RBAC / Corrected-Baseline Rerun

Use this scenario after pilot entry on the new `v1.0.0` pilot id.

This is not a replacement for `PD05`. It is the required rerun against the corrected canonical baseline before any expansion recommendation.

## Purpose

Re-prove privacy, tenant isolation, branch isolation, aggregate-only boundaries, and registration attribution on the corrected baseline without a repair loop.

## Scenario Summary

- Scenario ID: `PD05B`
- Name: `Privacy / RBAC / Corrected-Baseline Rerun`
- Expected color: `green`
- Expected decision: `continue`

## Preconditions

- the new `v1.0.0` pilot id has a valid pilot-entry artifact set
- `day-1` evidence exists on the new pilot id
- the corrected baseline is the current authority, not the historical repaired live-week data

## Command Order

1. run the canonical boundary and denial checks
2. run the corrected-baseline registration attribution checks
3. verify aggregate-only boundaries on admin and branch views
4. record the scenario result in the daily sheet
5. record the matching evidence row
6. record the matching observability row
7. record the matching decision row

## Pass Rules

`PD05B` passes only if:

- no cross-tenant leak occurs
- no cross-branch leak occurs
- aggregate-only visibility holds
- registration attribution remains reliable
- the evidence is recorded cleanly with no post-hoc repair

## Red Rules

`PD05B` is `red` if:

- any tenant or branch leak occurs
- aggregate-only visibility fails
- attribution becomes unreliable
- evidence custody is ambiguous enough that the result cannot be defended from the repo-backed trail

## Required Artifacts

- daily sheet for the rerun day
- copied evidence index row for that day
- matching observability row
- matching decision row
- repo-relative references to any test or export artifacts used to justify the result

## Promotion Rule

Do not authorize `expand` while `PD05B` is missing, blocked, or anything other than `green`.
