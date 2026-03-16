---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-16
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
supersedes_input: docs/plans/2026-03-15-master-pilot-testing-blueprint-v1.md
---

# P8 Pilot Redesign Blueprint V1

> Status: Active supporting input. This document defines the new `P8` pilot-redesign era after completed `P7`. It does not commit work by itself.

## Decision Summary

`P7` is complete and remains historical.

Its outputs remain valid:

- the pilot-readiness command model is in place
- Day 1 is recorded as `green / continue`
- Day 2 is recorded as historical pilot evidence and exposed the failure signatures that now define the reset gate

What changes is the pilot program shape.

The previous 14-day master pilot model should be superseded because it mixed too many validation concerns too early. The next pilot era should be a tighter, more governable, evidence-first rehearsal:

- `P8` is a new era, not a rewrite of `P7`
- `P8` is a `7-day pilot rehearsal`, not a broad live pilot
- `P8` starts only after a reset gate closes the concrete Day 2 failure signatures
- `P8` must use a new pilot id

## Why The Redesign Is Needed

The 14-day model was useful as an exploration artifact, but the first real run proved that it was not the right execution shape.

The main issues were:

1. too many concerns were coupled into early pilot days
2. orchestration traceability was implied rather than recorded explicitly
3. reset-gate defects were discovered during pilot execution rather than before a new run
4. the old day pack mixed readiness proof, operational proof, and executive review into a longer calendar than the current evidence model needs

This redesign keeps the `P7` artifact and decision machinery, but replaces the calendar shape and documentation contract around it.

## What Stays Stable From `P7`

`P8` must keep the existing `P7` command model intact:

- `pnpm pilot:check`
- `pnpm release:gate:prod -- --pilotId <pilot-id>`
- `pnpm pilot:evidence:record`
- `pnpm pilot:observability:record`
- `pnpm pilot:decision:record`
- `pnpm pilot:tag:ready`
- `pnpm pilot:cadence:check`

`P8` also keeps the same canonical daily vocabulary:

- status: `green | amber | red`
- decision: `continue | pause | hotfix | stop`

For `PD07`, any final `expand | repeat_with_fixes | pause | stop` outcome is an executive review recommendation layered on top of the canonical daily decision proof, not a schema rewrite.

## Repo Learning Integration

`P8` should explicitly reuse the repo's existing learning and incident machinery.

That means:

- pilot failure signatures are captured in the checked-in memory registry
- reset-gate work retrieves those lessons before a new run
- daily sheets can reference the advisory retrieval artifacts used that day
- incident handling continues to route through the checked-in incident playbook instead of ad hoc notes

The pilot redesign is therefore not only a new day pack. It is also a stronger connection between pilot execution and the repo's memory, proof, and incident systems.

## Historical Evidence Baseline

`P8` depends on, but does not reopen, the completed `P7` evidence base.

Historical anchor points:

- Day 1: `green / continue`
- Day 2: historical evidence of reset-gate failure signatures plus same-day recovery activity

Those artifacts remain part of the repo-backed trail and must not be rewritten to fit the new model.

## New Pilot Identity Rule

The redesigned rehearsal must start with a new pilot id.

Default convention:

- `pilot-ks-7d-rehearsal-<YYYY-MM-DD>`

No historical pilot id from the superseded 14-day rehearsal may be reused.

## P8 Structure

`P8` is split into two parts:

1. `P8R` Reset Gate Hardening
2. `P8P` Seven-Day Pilot Rehearsal

### `P8R` Reset Gate Hardening

This slice exists to close the concrete failure signatures already recorded in Day 2 before a new pilot begins.

Required closure areas:

- `pilot:check` stability for the intended rehearsal environment
- operator log-sweep guidance aligned with the installed Vercel CLI behavior
- deterministic observability-to-decision proof flow
- clear separation between working daily notes and canonical evidence rows
- a clean preflight proving the reset gate is actually closed

### `P8P` Seven-Day Pilot Rehearsal

The replacement pilot is seven days long and intentionally more compact.

Its purpose is to validate:

1. release and artifact custody
2. rollback and resume discipline
3. closed-loop role flow
4. SLA and branch-pressure handling
5. privacy, RBAC, and multi-tenant stress
6. communications and incident handling
7. executive review and final recommendation

## Seven-Day Day Map

### `PD01` Release Gate Green Baseline

- prove pilot-entry machinery is green
- prove artifact custody is correct
- expected result: `green / continue`

### `PD02` Rollback And Resume Baseline

- prove rollback tag discipline
- prove resume requirements are inspectable
- prove decision proof can reference rollback target cleanly
- expected result: `green / continue`

### `PD03` Closed-Loop Role Flow

- member -> agent -> staff -> branch_manager -> admin
- verify safe handoff and visibility boundaries
- expected result: `green` or bounded `amber`

### `PD04` SLA / Matter / Branch Pressure

- incomplete vs running SLA
- matter accounting
- branch queue pressure
- branch_manager recommendation path
- expected result: bounded `amber`, not `red`

### `PD05` Privacy / RBAC / Multi-Tenant Stress

- cross-tenant denial
- branch mismatch denial
- aggregate-only dashboard proof
- concurrent registration stress
- expected result: `green`

### `PD06` Communications And Incident Drill

- pilot-critical email
- in-app messaging
- hotline or WhatsApp if operationally real
- observability review
- controlled incident and hotfix path
- expected result: evidence-backed `continue` or bounded `hotfix`

### `PD07` Executive Review

- review KPI condition
- review incident pattern
- review branch-manager and admin decision trail
- final recommendation:
  - `expand`
  - `repeat_with_fixes`
  - `pause`
  - `stop`

## Multi-Agent Orchestration Requirement

`P8` must make orchestration explicit, not implied.

Every pilot day must record:

- lead orchestrator
- worker lanes used
- each worker lane scope
- what remained centralized
- who merged evidence
- who made the final daily judgment

Default lane model:

- orchestrator
- release or artifact lane
- observability lane
- security or boundary lane
- branch-ops lane when relevant

If a day runs without worker lanes, the daily sheet must say:

- `single-orchestrator run`
- and explain why

## Pilot Role Chain

`P8` continues to use the actual repo role chain:

1. member
2. agent
3. staff
4. branch_manager
5. admin

Role interpretation does not widen:

- `branch_manager` remains branch-scoped
- `branch_manager` remains an admin-portal role
- `branch_manager` remains oversight or read-only on pilot staff claim surfaces
- admin remains final decision authority

## Reset Gate Rule

No new pilot id may be created until the reset gate is green.

Reset-gate acceptance requires:

- every checklist item closed
- fresh `pnpm pilot:check` passes
- fresh `pnpm release:gate:prod -- --pilotId <new-pilot-id>` passes
- no historical pilot id reuse
- no continuation from Day 3 of the superseded 14-day pilot

## Compatibility Rules

`P8` must not require:

- new command names
- routing changes
- auth-layer changes
- tenancy changes
- `apps/web/src/proxy.ts` edits

`P8` is a planning and operating-model redesign first. Canonical promotion and reset-gate implementation come afterward.

## Expected Artifact Set

The `P8` planning package should result in:

- one new blueprint document
- one roadmap diff proposal
- one reset-gate checklist
- one `PD01-PD07` scenario pack
- updated daily-sheet template language for orchestration traceability

## Recommendation

The next canonical promotion should be:

1. preserve completed `P7` and its historical evidence
2. promote `P8R` Reset Gate Hardening
3. then promote `P8P` Seven-Day Pilot Rehearsal

This gives Interdomestik a cleaner, shorter, and more defensible pilot program without rewriting completed pilot history.
