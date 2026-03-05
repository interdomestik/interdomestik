---
plan_role: tracker
status: active
source_of_truth: true
owner: platform
last_reviewed: 2026-03-05
current_program_path: docs/plans/current-program.md
execution_log_path: docs/plans/2026-03-03-implementation-conformance-log.md
status_command: pnpm plan:status
---

# Current Tracker

> Authority: This is the only document allowed to define active execution status and task-level proof for program work.

## Active Queue

| ID    | Status        | Owner                      | Work                                                                            | Exit Criteria                                                                  |
| ----- | ------------- | -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `PG1` | `completed`   | `platform`                 | Adopt planning governance policy, metadata, and audit enforcement.              | `pnpm plan:audit` passes and CI runs it.                                       |
| `PG2` | `completed`   | `qa-release`               | Reconcile `A22` evidence references with in-repo artifacts and release reports. | Canonical status reflects only repo-verifiable `A22` evidence.                 |
| `PG3` | `in_progress` | `platform`                 | Populate advisory evidence for `A1`, `A2`, `B1`, and `F1` from live runs.       | `memory:validate` reports non-zero records and current advisory outputs exist. |
| `PG4` | `blocked`     | `platform + qa + security` | Evaluate the advisory promotion gate.                                           | Two-week evidence window is complete and a signed decision is recorded.        |
| `PG5` | `blocked`     | `product + platform`       | Start `C`, `D`, and `E` workstreams.                                            | `PG4` passes.                                                                  |

## Status Command

```bash
pnpm plan:status
```

## Proof Ledger

| ID    | Source Refs                                            | Execution  | Run ID                                | Run Root               | Sonar            | Docker           | Sentry           | Learning         | Evidence Refs                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------ | ---------- | ------------------------------------- | ---------------------- | ---------------- | ---------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PG1` | `governance:policy`                                    | `manual`   | `manual-20260305-planning-governance` | `not_applicable`       | `not_applicable` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/planning-governance-policy.md`; `scripts/plan-audit.mjs`; `.github/workflows/ci.yml`                                                                                                                                                                          |
| `PG2` | `bulletproof:A22`; `commit:9d6a481`; `commit:5308d18`  | `manual`   | `manual-20260305-a22-reconciliation`  | `not_applicable`       | `not_applicable` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/2026-03-05-a22-evidence-reconciliation.md`; `docs/plans/2026-02-22-v1-bulletproof-tracker.md`; `docs/release-gates/2026-02-11_production_dpl_3UMSijeubaShN5f4zkLK6LKPm4rs.md`; `docs/release-gates/2026-02-21_production_dpl_AQGjArgJBkjLDwB6CBXaCyVTS5Ax.md` |
| `PG3` | `charter:A1`; `charter:A2`; `charter:B1`; `charter:F1` | `scripted` | `advisory-20260304-foundation`        | `tmp/plan-conformance` | `not_applicable` | `not_applicable` | `not_applicable` | `pending`        | `docs/plans/2026-03-03-implementation-conformance-log.md`; `docs/plans/2026-03-03-implementation-conformance-log.jsonl`; `tmp/plan-conformance/advisory-signal-report.json`; `tmp/plan-conformance/advisory-retrieval-report.json`                                        |
| `PG4` | `charter:promotion-gate`                               | `blocked`  | `blocked`                             | `blocked`              | `not_applicable` | `not_applicable` | `not_applicable` | `pending`        | `docs/plans/2026-03-03-advisory-foundation-addendum.md`; `docs/plans/2026-03-03-implementation-conformance-log.md`                                                                                                                                                        |
| `PG5` | `charter:C1`; `charter:D1`; `charter:E1`               | `blocked`  | `blocked`                             | `blocked`              | `not_applicable` | `not_applicable` | `not_applicable` | `not_applicable` | `docs/plans/current-program.md`; `docs/plans/2026-03-03-advisory-foundation-addendum.md`                                                                                                                                                                                  |

## Imported Historical Work

- `A22` from the February bulletproof tracker is reconciled through `PG2`; it is not an active streak in the current program.
- `A1`, `A2`, `B1`, and `F1` from the March charter remain active only through `PG3` and `PG4`.

## `PG2` Working Notes

- imported source: `docs/plans/2026-02-22-v1-bulletproof-tracker.md`
- historical docs-only claims:
  - commit `9d6a4810b3b5420fe1e6f191efd1901fef1128b4` recorded `1/10`
  - commit `5308d18fc7954bef406ae2bd3d1f7fb30946edce` recorded `2/10`
- repo-verifiable release-gate files currently present:
  - `docs/release-gates/2026-02-11_production_dpl_3UMSijeubaShN5f4zkLK6LKPm4rs.md`
  - `docs/release-gates/2026-02-21_production_dpl_AQGjArgJBkjLDwB6CBXaCyVTS5Ax.md`
- reconciliation result:
  - the February 24-25 streak notes are preserved as historical assertions only
  - the referenced February 24-25 release report and streak artifacts are not present in the repository or tracked git history
  - repository-verifiable `A22` progress is `0/10`

`PG2` is closed. Any future `A22` restart requires a new active tracker item with checked-in evidence.

## Recommendation Pool

The 12-point maturity assessment remains recommendation input. Its items are not committed work until they appear in the Active Queue above.
