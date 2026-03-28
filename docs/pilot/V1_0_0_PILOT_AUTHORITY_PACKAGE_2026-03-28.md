# v1.0.0 Pilot Authority Package

Date: `2026-03-28`
Prepared on branch: `codex/v1-pilot-next-steps`
Canonical references:

- `docs/pilot/PILOT_GO_NO_GO.md`
- `docs/pilot/PILOT_RUNBOOK.md`
- `docs/pilot/PILOT_CLOSEOUT_pilot-ks-process-proof-2026-03-25.md`
- `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-process-proof-2026-03-20.md`
- `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-live-2026-03-18.md`

## Purpose

This package turns the current `v1.0.0` readiness conclusion into a bounded pilot release plan. It does not reopen the prior process-proof line. It creates the next authority line that should govern a `v1.0.0` pilot decision.

## Decision Posture

`v1.0.0` should be treated as a pilot release, not as expansion proof.

Why:

- the prior process-proof line closed successfully, but with `Expansion ready: no`
- the prior live week needed post-hoc canonical repair before its thresholds were defensible
- `2 Operating-Day Progression` remained materially below target
- the canonical executive posture remained bounded: `pause` / `repeat_with_fixes`, not `expand`

## Proposed New Authority Line

Use a fresh pilot id for the `v1.0.0` release line:

```text
pilot-ks-v1-0-0-2026-03-28
```

This should become the governing pilot id for the next bounded launch window. Do not append this work to the closed `pilot-ks-process-proof-2026-03-20` line.

## Step Mapping

### 1. Treat `v1.0.0` as a pilot release decision

Operational rule:

- do not call the next state expansion
- do not reuse the old process-proof closeout as launch authority
- require a fresh production gate and a fresh copied evidence index for the new pilot id

### 2. Create a fresh pilot-entry authority line

Canonical entry command:

```bash
pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28
```

Expected canonical outputs:

- `docs/release-gates/YYYY-MM-DD_production_<deployment>.md`
- `docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-v1-0-0-2026-03-28.md`
- pointer row in `docs/pilot-evidence/index.csv`

Required follow-on artifact binding:

```bash
pnpm pilot:tag:ready -- --pilotId pilot-ks-v1-0-0-2026-03-28 --date 2026-03-28
```

### 3. Run a fresh production release gate on merged `main`

Required sequence:

```bash
pnpm pilot:check
pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28
```

This must be executed from merged `main`, with production release-gate credentials and the intended production deployment target available.

### 4. Keep the pilot scope narrow

Scope for the next window:

- tenant: `KS`
- one branch authority line
- named `Member`, `Agent`, `Staff`, `Admin` operators
- no expansion beyond the bounded cohort
- no routing, auth, tenancy, or proxy redesign as part of pilot operation

Suggested cohort:

- `1` branch
- `1` staff operator
- `2` agents
- `20-50` members

### 5. Make the next objective about clean operation without repair

The next pilot window should prove:

- clean canonical evidence from day 1
- no post-hoc repair of claim, timeline, or message custody
- immediate daily evidence, observability, and decision recording on the new pilot id

Success condition:

- every operating day is defensible directly from the canonical repo-backed artifacts without retrospective repair

### 6. Make progression the main operating objective

Carry forward the prior weak spot as the next explicit operating target.

Primary objective:

- improve `2 Operating-Day Progression`

Target for the next bounded window:

- `>= 85%` of claims progress within `48` hours

Supporting targets:

- keep triage SLA and public update SLA at or above the already-proven thresholds
- do not trade away privacy, tenancy, or evidence quality for throughput

### 7. Re-run Day-5-style privacy and RBAC proof on the corrected baseline

Required during the next live window:

- rerun privacy, RBAC, and multi-tenant spot checks against the corrected canonical baseline
- record the result in the copied pilot evidence index under observability and weekly review notes

Minimum areas to re-prove:

- cross-tenant denial
- cross-branch denial
- aggregate-only behavior
- registration attribution and tenant-context correctness

### 8. Require explicit executive approval for anything beyond bounded continuation

Cadence pass is not expansion approval.

Any move beyond bounded pilot continuation requires:

- fresh copied evidence index for the new pilot id
- fresh production release-gate proof
- a new executive review artifact for the new pilot id
- an explicit recommendation stronger than `pause` / `repeat_with_fixes`
- named owner, end condition, and rollback target

## Required Operating Commands

Pilot entry:

```bash
pnpm pilot:check
pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28
pnpm pilot:tag:ready -- --pilotId pilot-ks-v1-0-0-2026-03-28 --date 2026-03-28
```

Daily evidence:

```bash
pnpm pilot:evidence:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --day <n> --date <YYYY-MM-DD> --owner "<owner>" --status <green|amber|red> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --decision <continue|pause|hotfix|stop> --bundlePath <path|n/a>
pnpm pilot:observability:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear|expected-noise|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold|watch|breach> --incidentCount <n> --highestSeverity <none|sev3|sev2|sev1> --notes <text|n/a>
pnpm pilot:decision:record -- --pilotId pilot-ks-v1-0-0-2026-03-28 --reviewType <daily|weekly> --reference <day-<n>|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --decision <continue|pause|hotfix|stop> --observabilityRef <day-<n>|week-<n>>
```

Cadence, only after qualifying day rows exist:

```bash
pnpm pilot:cadence:check -- --pilotId pilot-ks-v1-0-0-2026-03-28
```

## External Prerequisites And Blockers

These parts cannot be completed by documentation alone:

- production release-gate credentials and environment access
- production deployment id or URL for log sweeps
- named operators and owners for the new pilot line
- exact launch date for the new pilot id
- live execution of the privacy/RBAC re-proof on the intended production baseline

## Recommended Go / Hold Rule

Go only when:

- merged `main` is stable
- `pnpm pilot:check` passes on current `HEAD`
- `pnpm release:gate:prod -- --pilotId pilot-ks-v1-0-0-2026-03-28` passes
- the fresh copied evidence index exists
- the rollback-ready tag is created or verified
- the bounded scope and progression objective are explicitly accepted

Hold if:

- the new pilot-entry artifact set is missing
- production release proof is stale or absent
- the next pilot line is framed as expansion without a fresh executive authorization
- privacy/RBAC re-proof is deferred indefinitely
