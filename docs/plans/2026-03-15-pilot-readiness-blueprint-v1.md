---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-15
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# Pilot Readiness Blueprint V1

> Status: Active supporting input. This document defines the next execution era after the completed commercial blueprint era. It does not commit work by itself.

## Decision Summary

Interdomestik has completed the business-model blueprint era.

The next era should not widen product scope again. It should prove that the implemented system is:

1. launchable
2. evidence-backed
3. operationally governable
4. reversible under stress

This next era is `Pilot Readiness And Operational Proof`.

Its purpose is to convert the already-completed release-gate, pilot, and rollback machinery into one canonical operating system that current-program and current-tracker can promote cleanly.

That operating system should model the live pilot role chain explicitly. The repo truth is not only member, agent, staff, and admin. `branch_manager` is already a branch-scoped admin-portal role, can review branch-level admin and claim context, and currently has read or oversight visibility on pilot staff claim surfaces without taking full staff processing actions.

## Audit Summary

### What Is Complete

- the commercial contract is published and enforced
- Free Start, disclaimers, fee logic, and group-access boundaries are in place
- staff acceptance control, matter accounting, and collection fallback are implemented
- `G07` through `G10` are complete in `docs/plans/current-program.md`
- release-gate reporting exists under `docs/release-gates/`
- pilot governance documents already exist:
  - `docs/pilot-entry-criteria.md`
  - `docs/pilot/PILOT_RUNBOOK.md`
  - `docs/pilot/PILOT_GO_NO_GO.md`
  - `docs/pilot/PILOT_KPIS.md`

### What Is Still Weak

The remaining gaps are not product-capability gaps. They are operating-model gaps.

#### 1. Evidence custody is split across multiple places

- release reports live in `docs/release-gates/`
- local pilot logs live under `tmp/pilot-evidence/`
- `docs/pilot-evidence/index.csv` records historical runs, but it does not reflect the newer 14-day evidence-index template shape
- the copied per-pilot evidence index expected by `docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md` is not yet the canonical day-by-day operating artifact

#### 2. Readiness commands are partially duplicated

- `pnpm pilot:check` maps to `release:gate:prod`
- `./scripts/pilot-verify.sh` runs a different pre-launch command pack
- this is workable, but it is not yet one clearly ranked readiness path with one required artifact output

#### 3. Release evidence is not yet tied to pilot decisions

- the release gate can generate a GO or NO-GO report
- the pilot docs define continue, defer, hotfix, and stop decisions
- there is not yet one canonical artifact that links:
  - release report
  - pilot day
  - owner
  - incident severity
  - continue or rollback decision

#### 4. Rollback discipline is documented but not yet promoted as a canonical execution surface

- `pilot-ready-YYYYMMDD` tagging is described in the runbook
- the current program and tracker do not yet contain explicit work ensuring tag creation, validation, and resume discipline are repo-verifiable

#### 5. Historical streak ambiguity is reconciled, but not fully replaced

- `docs/plans/2026-03-05-a22-evidence-reconciliation.md` correctly downgraded old streak claims to historical assertions
- the repo now has newer release-gate reports and streak tooling
- what is still missing is a modern canonical readiness cadence that current-program and current-tracker can point to without ambiguity

#### 6. Some current evidence still looks like operator output rather than pilot-grade custody

- `docs/release-gates/2026-03-14_production_unknown.md` proves the runner works, but it also shows weak deployment provenance and a partial-scope NO-GO report
- that is acceptable as an intermediate artifact, but not yet the clean pilot-entry record the next era should standardize

## Era Definition

The completed blueprint era answered:

- what Interdomestik sells
- how it gets paid
- what is included
- how staff-led recovery is controlled

The next era should answer:

- can the team prove launch readiness repeatedly
- can the team enter pilot with deterministic evidence
- can the team continue, pause, hotfix, or roll back using one canonical operating model
- can the repo prove those decisions later without relying on memory or local-only files

## What This Era Is Not

This era is not:

- a broad UI refresh
- a new feature wave
- a redesign of routing, auth, tenancy, or shell architecture
- a return to broad advisory planning

It stays inside Phase C rules:

- `apps/web/src/proxy.ts` remains untouched
- canonical routes remain unchanged
- no auth or tenancy refactor
- no separate enterprise product

## Recommended Next Tranche

Promote one new tranche after completed `P6`:

`P7` `Pilot Readiness And Release Evidence`

### Why `P7` Is The Right Next Tranche

- it uses the machinery already built in `G07` through `G10`
- it closes the real launch gap instead of reopening product scope
- it turns the existing pilot docs from guidance into canonical operating proof
- it creates the bridge from blueprint implementation to actual pilot execution

## `P7` Work Items

### `R01` Canonicalize the pilot-ready artifact set

Create one explicit artifact contract for pilot entry.

Exit criteria:

- every pilot-entry run produces:
  - one release-gate report in `docs/release-gates/`
  - one pilot evidence index file copied from the template
  - one machine-readable pointer row in `docs/pilot-evidence/index.csv`
- the artifact contract is documented in one canonical place

### `R02` Unify readiness commands and outputs

Clarify which command is used for:

- pre-launch local verification
- production release-gate proof
- launch-day pilot verification

Exit criteria:

- `pilot:check`, `release:gate:prod`, and `scripts/pilot-verify.sh` have non-overlapping, documented roles
- operator docs no longer leave ambiguity about which command is authoritative for pilot entry

### `R03` Add deterministic pilot evidence capture

Make day-by-day pilot evidence reproducible and consistent.

Exit criteria:

- a copied per-pilot evidence index becomes the required daily artifact
- each day records:
  - owner
  - status
  - report path
  - bundle path or `n/a`
  - highest severity
  - decision
- when a pilot day is branch-local, the evidence row records the branch context and whether branch-manager review was part of that day's evidence
- evidence format matches the pilot runbook and does not rely on memory

### `R04` Add explicit continue, pause, hotfix, and rollback decision proof

Pilot decisions should become inspectable artifacts, not meeting notes.

Exit criteria:

- each pilot decision is recorded in a standard repo-backed format
- branch-local issues can record a branch-manager recommendation separately from the admin-level continue, defer, hotfix, or stop decision
- the format supports:
  - continue
  - defer
  - hotfix
  - stop or rollback
- stop decisions must reference rollback target and re-validation requirement

### `R05` Make pilot-ready tag and rollback target discipline repo-verifiable

The runbook already requires a known-good pilot tag. This needs explicit enforcement.

Exit criteria:

- the latest `pilot-ready-YYYYMMDD` target is documented in the pilot evidence set
- rollback target is referenced in continue or stop decisions
- resume after rollback requires a fresh pilot verification run and new evidence row

### `R06` Establish a modern readiness cadence

Replace historical streak ambiguity with a current, source-backed cadence.

Exit criteria:

- the repo defines a clear readiness cadence such as a 3-run or 3-day green streak before pilot entry
- the cadence is backed by committed release reports and evidence-index rows
- old `A22` ambiguity is no longer relevant to live governance

### `R07` Tighten observability and incident evidence for pilot

The pilot docs define operational thresholds. `P7` should make them evidence-backed.

Exit criteria:

- production log sweeps, incident counts, and highest severity are linked to the pilot evidence set
- branch-local issues remain distinguished from system-wide issues in pilot evidence and incident summaries
- expected authorization-deny noise remains distinguished from functional errors
- week-1 continue or pause decisions reference KPI and incident evidence directly

### `R08` Publish the pilot-entry command pack and operator checklist as one ranked flow

The current docs are useful, but still distributed.

Exit criteria:

- operator flow is ranked as:
  1. pre-launch checks
  2. release-gate proof
  3. pilot-entry evidence generation
  4. launch-day closed-loop walkthrough
  5. branch-manager review and escalation recommendation when branch-level context exists
  6. admin-level daily decision logging
- the operator flow states that branch-manager review uses admin-portal and branch-level oversight surfaces and does not expand into staff claim-processing authority
- there is one canonical entry point for a human operator resuming the pilot process

## Recommended Promotion Order

If promoted, `P7` should be the only new tranche after `P6`.

Promote:

- `P7` `Pilot Readiness And Release Evidence`
- `R01`
- `R02`
- `R03`
- `R04`
- `R05`
- `R06`
- `R07`
- `R08`

Do not promote a broad UI or UX tranche before `P7` closes.

## What UI Work Is Allowed During `P7`

Only pilot-blocking polish should be allowed during this era.

Examples:

- hydration mismatch that damages trust on launch surfaces
- auth accessibility or semantics that block activation
- copy or CTA continuity bugs that break pilot entry or member onboarding
- missing marker or evidence text required by release-gate or pilot scripts

Do not widen into:

- broad visual redesign
- cross-portal style refactor
- agent workspace redesign
- staff or admin redesign beyond pilot-critical clarity fixes

## What Should Follow `P7`

Only after `P7` closes and a pilot has begun cleanly should the program promote the next experience-oriented era:

`P8` `Pilot-Learned Trust And Activation UX`

That later era should be informed by:

- actual pilot conversion data
- pilot activation drop-off
- agent demo feedback
- member return behavior
- operational friction observed during the pilot

## Audit Conclusion

The next era should not be framed as “more blueprint.”

It should be framed as:

- blueprint era complete
- pilot-readiness era next
- pilot role chain explicit across member, agent, branch-manager oversight, staff processing, and admin decision custody
- UX optimization era after pilot evidence exists

This is the narrowest next step that improves launch safety, keeps governance clean, and avoids reopening product scope before the first real pilot proves the implemented model.
