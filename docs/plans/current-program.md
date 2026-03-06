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

Advisory evidence refreshed; promotion review remains blocked on the two-week evidence window.

## Program Goals

1. Remove competing live plans.
2. Reconcile unresolved pilot-release evidence custody.
3. Continue advisory A/B/F work without promoting it to blocking enforcement too early.

## Status Command

```bash
pnpm plan:status
```

## Proof Command

```bash
pnpm plan:proof
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

Reconciliation outcome recorded in:

- `docs/plans/2026-03-05-a22-evidence-reconciliation.md`

Current canonical interpretation:

- commits `9d6a4810b3b5420fe1e6f191efd1901fef1128b4` and `5308d18fc7954bef406ae2bd3d1f7fb30946edce` updated the legacy tracker to claim `1/10` and `2/10`
- those commits changed only the tracker text; the referenced February 24-25 evidence paths are not checked into this repository or tracked in git history
- the referenced `docs/release-gates/2026-02-25_production_unknown.md` report was never tracked in this repository
- repository-verifiable `A22` progress is `0/10`

`PG2` is closed by correcting the canonical status to this repo-verifiable interpretation. Any future streak work must be recommitted as a new active tracker item with checked-in evidence.

## Review Rule

Any new roadmap, assessment, or strategy memo must end in one of two states:

- copied into `current-program.md` and `current-tracker.md`
- left as non-committed input

There is no third state.

## Proof Chain

Committed work is only considered inspectable when the tracker can answer this chain:

1. source refs
2. execution mode and run identity
3. `sonar` / `docker` / `sentry` status
4. learning status and evidence refs
