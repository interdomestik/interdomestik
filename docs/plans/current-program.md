---
plan_role: canonical_plan
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-05
tracker_path: docs/plans/current-tracker.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Program

> Authority: This is the only document allowed to define the current phase, committed priorities, and sequencing for repository execution.

## Current Phase

Evidence-custody reconciliation and advisory-foundation execution.

## Program Goals

1. Remove competing live plans.
2. Reconcile unresolved pilot-release evidence custody.
3. Continue advisory A/B/F work without promoting it to blocking enforcement too early.

## Status Command

```bash
pnpm plan:status
```

## Committed Priorities

1. `PG1` Planning governance baseline
   Exit criteria: `pnpm plan:audit` passes locally and in CI; legacy planning docs are tagged with governance metadata.
2. `PG2` A22 evidence custody reconciliation
   Exit criteria: tracker references only checked-in evidence, or missing evidence is regenerated and committed; A22 status is explicit and no legacy status command is needed to understand it.
3. `PG3` Advisory evidence population for `A1`, `A2`, `B1`, and `F1`
   Exit criteria: the memory registry has real entries, advisory reports are produced from live runs, and the baseline/noise reports are refreshed from current evidence.
4. `PG4` Advisory promotion review
   Exit criteria: Platform, QA, and Security record an explicit pass/fail decision against the promotion thresholds.

## Blocked Until `PG4` Passes

- `C1` Desktop Ops Hardening
- `D1` Mobile Foundation
- `E1` Integration Backbone Contract
- any downstream `C`, `D`, or `E` execution item

## Inputs, Not Active Plans

These documents can recommend or constrain work, but they do not define the live program:

- `docs/MATURITY_ASSESSMENT_2026.md`
- `docs/EXECUTIVE_MATURITY_ASSESSMENT.md`
- `docs/plans/2026-02-22-v1-bulletproof-tracker.md`
- `docs/plans/2026-03-03-program-charter-canonical.md`
- `docs/plans/2026-03-03-advisory-foundation-addendum.md`

## Imported Open Work

### `A22` Legacy Import

Source: `docs/plans/2026-02-22-v1-bulletproof-tracker.md`

Current canonical interpretation:

- the repo claims `2/10` daily full-green RC runs were completed on February 24 and February 25, 2026
- the referenced February 24-25 evidence paths are not checked into this repository
- the referenced `docs/release-gates/2026-02-25_production_unknown.md` report is not present in this repository

Until that evidence is restored or the historical note is corrected, `A22` remains open through `PG2`.

## Review Rule

Any new roadmap, assessment, or strategy memo must end in one of two states:

- copied into `current-program.md` and `current-tracker.md`
- left as non-committed input

There is no third state.
