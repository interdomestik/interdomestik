---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-05
---

# Interdomestik Advisory Foundation Addendum

> Status: Active supporting constraint document. It can limit execution, but it does not define current priorities.

- version: `1.0.0`
- effective_date: `2026-03-03`
- supersedes: `Advisory scope alignment notes from 2026-03-03 planning thread`
- change_control_rule: `Any proposal to enforce memory or boundary checks before thresholds pass requires explicit approval from Platform + QA + Security owners.`

## Summary

This addendum constrains early execution to the A/B foundation in advisory mode so Phase C stability is not at risk.

## Locked Scope (Sprint 1-2)

1. `A1` Memory Registry & Candidate Capture
2. `A2` Memory Retrieval Injection & Promotion Controls (advisory-only)
3. `B1` Boundary Change Contract (advisory-only)
4. `F1.0` Baseline reliability/noise measurement

## Blocking Rule

- `C`, `D`, and `E` execution must not begin until the advisory promotion gate passes.

## Advisory Mode Requirements

- Signal and report generation is allowed.
- New blocking gates are not allowed during Sprint 1-2.
- Existing mandatory Phase C gates remain unchanged.

## Promotion Gate (Advisory -> Enforced)

All conditions must hold for 2 consecutive weeks:

1. `0` Phase C control regressions.
2. `<10%` unrelated PR noise from memory/boundary checks.
3. `>=70%` retrieval usefulness in reviewed cases.
4. `<15%` gate runtime increase versus baseline.
5. Boundary report interpretation stable across Platform + QA + Security.
6. `0` verified tenant/boundary regressions introduced by new advisory systems.

If any condition fails, remain advisory and continue tuning.

## Explicit Command Status

- `pnpm e2e:gate:fast` -> `Evidenced`
- `pnpm memory:validate` -> `Evidenced`
- `pnpm memory:retrieve` -> `Evidenced`
- `pnpm memory:advisory:report` -> `Evidenced`
- `pnpm memory:promote` -> `Evidenced`
- `pnpm boundary:taxonomy:validate` -> `Evidenced`
- `pnpm boundary:diff:report` -> `Evidenced`
- `pnpm boundary:contract:check` -> `Evidenced`
- `pnpm memory:eval` -> `Proposed addition`

## Governance Artifact Contracts

### ConformanceStepRecordV1

- `step_id`, `epic_id`, `mode`, `files_changed[]`, `checks[]`, `result`, `variance`, `decision`, `owner`, `timestamp`

### AdvisorySignalReportV1

- `run_id`, `retrieval_hits[]`, `noise_flags[]`, `boundary_findings[]`, `usefulness_score`

### PromotionDecisionV1

- `window`, `thresholds`, `pass_fail`, `approvers`, `effective_mode`

## Track Order (Fixed)

1. Track 1: `A1`
2. Track 2: `A2` (advisory)
3. Track 3: `B1` (advisory)

## Ownership

- Platform: `A1`, `A2`, `B1`
- QA/Release: `F1.0` baseline and ongoing noise tracking
- Security: promotion/HITL policy for sensitive lessons
- Product + QA: KPI dictionary for later `C/D/E` wave

## External Design Appendix (Non-Repo Evidence)

External techniques are retained for design inspiration only and are not used to assert current-state implementation status.
