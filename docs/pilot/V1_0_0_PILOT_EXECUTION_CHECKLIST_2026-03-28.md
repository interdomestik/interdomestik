# v1.0.0 Pilot Execution Checklist

Use this checklist for the fresh `v1.0.0` pilot authority line.

Proposed pilot id:

```text
pilot-ks-v1-0-0-2026-03-28
```

## A. Pre-Entry

- [ ] Confirm `v1.0.0` is being treated as a pilot release, not expansion
- [ ] Confirm merged `main` is the operating source
- [ ] Confirm named owners for `Member`, `Agent`, `Staff`, `Admin`, and engineering escalation
- [ ] Confirm one-branch KS scope only
- [ ] Confirm production release-gate credentials are available
- [ ] Confirm production deployment id or URL is available for log sweep

## B. Fresh Pilot Entry

- [ ] Run:

```bash
pnpm pilot:check
```

- [ ] Run:

```bash
pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28
```

- [ ] Verify these artifacts now exist:
  - `docs/release-gates/YYYY-MM-DD_production_<deployment>.md`
  - `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-2026-03-28.md`
  - pointer row in `docs/pilot-evidence/index.csv`

- [ ] Bind rollback tag:

```bash
pnpm pilot:tag:ready -- --pilotId pilot-ks-v1-0-0-2026-03-28 --date 2026-03-28
```

## C. Daily Operating Discipline

- [ ] Record daily evidence on the copied evidence index, not in ad hoc notes
- [ ] Record observability before the matching decision row
- [ ] Keep evidence custody clean enough that no post-hoc canonical repair is needed
- [ ] Track progression explicitly, not only triage/update SLA

Daily command skeleton:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --day <n> --date <YYYY-MM-DD> --owner "<owner>" --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|pause|hotfix|stop> --bundlePath <path|n/a>
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --reference day-<n> --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --reviewType daily --reference day-<n> --date <YYYY-MM-DD> --owner "<owner>" --decision <continue|pause|hotfix|stop> --observabilityRef day-<n>
```

## D. Bounded Objectives

- [ ] Keep cohort narrow: KS, one branch, bounded operators, bounded members
- [ ] Keep the next objective explicit: clean operation without repair
- [ ] Keep the main performance objective explicit: `2 Operating-Day Progression >= 85%`
- [ ] Keep triage SLA and public update SLA at the already-proven level

## E. Privacy / RBAC Re-Proof

- [ ] Re-run Day-5-style privacy and RBAC checks against the corrected baseline
- [ ] Reconfirm cross-tenant deny
- [ ] Reconfirm cross-branch deny
- [ ] Reconfirm aggregate-only behavior
- [ ] Reconfirm tenant-attribution correctness
- [ ] Write results into weekly observability and executive review artifacts

## F. Executive Decision Gate

- [ ] Do not infer expansion from cadence alone
- [ ] Require a fresh executive review artifact for this pilot id
- [ ] Require explicit owner, end condition, and rollback target for any continuation beyond the bounded window
- [ ] Require a recommendation stronger than `pause` / `repeat_with_fixes` before any expansion claim

Weekly / executive command skeleton:

```bash
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --reference week-1 --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --reviewType weekly --reference week-1 --date <YYYY-MM-DD> --owner "<owner>" --decision <continue|pause|hotfix|stop> --observabilityRef week-1
```

## G. What Cannot Be Faked

These items still require live execution:

- production release-gate pass
- copied evidence index generation for the new pilot id
- rollback tag binding to that exact pilot-entry report
- production log sweep
- privacy/RBAC re-proof on the live corrected baseline
- fresh executive review for the new pilot line
