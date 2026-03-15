---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-15
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# Master Pilot Testing Blueprint V1

> Status: Active supporting input. This document defines a 14-day enterprise-grade pilot testing model for Interdomestik after the completed business-model blueprint and `P6` release-gate implementation. It does not commit work by itself.

## Decision Summary

Interdomestik should run pilot testing as a structured enterprise program, not as an ad hoc sequence of checks.

The pilot should validate:

1. release readiness
2. operational evidence custody
3. multi-role workflow execution
4. branch-scoped oversight
5. multi-tenant safety under stress
6. incident handling and rollback discipline

This pilot model is designed to work with the current repo reality:

- the commercial blueprint is implemented
- `G07` through `G10` are complete
- `branch_manager` exists as a branch-scoped oversight role
- pilot readiness work is now modeled under `P7`

## Dependencies From Prior Blueprint

This pilot blueprint depends on the completed commercial blueprint in `docs/plans/2026-03-09-interdomestik-business-model-blueprint-v1.md`.

The pilot is not generic product QA. It is meant to validate the launch-model promises that blueprint defined:

- the three-step ladder of `Free Start -> membership -> staff-led recovery`
- the claims-first scope and referral boundaries
- the contractual `matter` definition and allowance model
- the narrow `24 business hour` triage SLA after a completed pack
- the coverage matrix and guidance-only or referral-only boundaries
- the success-fee model, minimum fee, and escalation-agreement prerequisites
- the group-access privacy boundary and aggregate-only visibility rule
- the distinction between informational guidance, human triage, staff-led recovery, and external legal action

## Dependencies From Current Program

This pilot blueprint also depends on the completed canonical program state in `docs/plans/current-program.md`.

The pilot should be treated as a validation layer over the completed tranches, not as a new feature build.

| Completed tranche | What the pilot depends on                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1C`             | published claims-first scope, coverage matrix, disclaimers, fee calculator, annual terms, and funnel instrumentation                                                        |
| `P1T`             | Free Start shell, confidence score, evidence prompts, trust surfaces, and `/services` alignment                                                                             |
| `P2`              | signed commercial terms, cancellation/refund enforcement, collection fallback, and billing auditability                                                                     |
| `P3`              | typed commercial actions, idempotency, matter-consumption guards, and escalation decision auditability                                                                      |
| `P4`              | staff queue, assignment, stage history, SLA states, internal-note isolation, messaging, acceptance gates, collection prerequisites, and guidance-only enforcement           |
| `P4G`             | roster import, aggregate-only group dashboards, sponsored-seat activation, and privacy-consent boundaries                                                                   |
| `P6`              | release-gate proof for commercial promise surfaces, privacy boundaries, matter and SLA enforcement, and escalation-agreement plus collection-fallback enforcement           |
| `P7`              | canonical pilot artifact contract, readiness-command authority, deterministic evidence, rollback proof, readiness cadence, observability evidence, and ranked operator flow |

## Pilot Coverage Matrix

The master pilot should show exactly which completed promises and tranches each scenario validates.

| Scenario | Primary validation target        | Prior blueprint dependency                                                              | Canonical tranche coverage                                |
| -------- | -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `PD01`   | release-gate green baseline      | published commercial contract must stay visible and intact                              | `P1C`, `P1T`, `P6`, `P7/R01-R02`                          |
| `PD02`   | rollback baseline                | launch promises must be recoverable to a known pilot-ready state                        | `P2`, `P6`, `P7/R04-R05`                                  |
| `PD03`   | branch escalation chain          | branch-scoped oversight and admin custody on top of the claims-first model              | `P4`, `P6`, `P7/R03-R04-R08`                              |
| `PD04`   | green-day closed loop            | `Free Start -> membership -> staff-led handling` with safe role handoffs                | `P1C`, `P1T`, `P3`, `P4`, `P7/R03-R08`                    |
| `PD05`   | missing-information SLA wait     | SLA starts only after a completed pack and waiting state stays explicit                 | `P1C`, `P1T`, `P4/S03-S04`, `P6/G09`, `P7/R03`            |
| `PD06`   | accepted recovery ready          | accepted monetary recovery can proceed only with agreement and collection path in place | `P1C`, `P2/B07-B10`, `P3/M04-M05`, `P4/S08-S09`, `P6/G10` |
| `PD07`   | accepted recovery blocked        | accepted recovery stays blocked when agreement or collection prerequisites are missing  | `P1C`, `P2`, `P4/S08-S09`, `P6/G10`, `P7/R04`             |
| `PD08`   | guidance-only enforcement        | non-monetary matters stay outside success-fee handling                                  | `P1C`, `P4/S10`, `P6`, `P7/R03`                           |
| `PD09`   | multi-tenant registration stress | claims-first commercial state and activation must remain tenant-correct under volume    | `P1C`, `P1T`, `P3`, `P4G`, `P7/R03-R07`                   |
| `PD10`   | branch backlog and SLA drift     | branch-local queue pressure, SLA risk, and escalation recommendation remain inspectable | `P4/S01-S04-S07`, `P6/G09`, `P7/R03-R04-R07-R08`          |
| `PD11`   | privacy and RBAC boundary stress | aggregate-only group promise and strict role or branch boundaries hold under pressure   | `P1C`, `P4/S05`, `P4G/GA02-GA04`, `P6/G08`, `P7/R07`      |
| `PD12`   | communications reliability       | hotline or messaging promises remain guidance-safe, persistent, and role-correct        | `P1C/C03-C05`, `P1T/T04`, `P4/S05-S06`, `P7/R03-R08`      |
| `PD13`   | incident stop and rollback       | stop, hotfix, rollback, and resume decisions stay evidence-backed                       | `P6`, `P7/R04-R07`                                        |
| `PD14`   | executive review                 | final expand, repeat, pause, or stop decision is grounded in repo-backed proof          | `P6`, `P7/R01-R08`                                        |

## Pilot Model Type

There are two valid modes.

### Mode A: Enterprise Pilot Rehearsal

Use seeded or simulated data with no real users.

This mode proves:

- workflow correctness
- evidence generation
- operator readiness
- branch-manager and admin decision flow
- rollback and resume mechanics

This mode does not fully prove:

- real adoption
- real SLA behavior under live human unpredictability
- real conversion or retention

### Mode B: Controlled Live Pilot

Use a real branch cohort with actual users and actual day-by-day operations.

This mode proves:

- live operating discipline
- real SLA outcomes
- real queue and communication behavior
- real continue or pause decisions

Recommended path:

1. run Mode A first
2. then run Mode B with a smaller live cohort

## Pilot Role Chain

The pilot must use the actual operational chain in this repository:

1. member
2. agent
3. staff
4. branch_manager
5. admin

Role interpretation for pilot use:

- `member`: submits claims and responds to requests
- `agent`: assists intake, follows up, and provides handoff context
- `staff`: performs triage, updates claims, and manages claim handling
- `branch_manager`: branch-scoped oversight, queue and SLA monitoring, branch escalation recommendation, read-only monitoring on pilot staff surfaces
- `admin`: tenant-wide oversight, final continue or pause or rollback authority

## Multi-Agent Topology

Use one orchestrator and bounded worker lanes.

### Lead Orchestrator

Owns:

- daily plan
- scenario scheduling
- evidence merge
- contradiction checks
- daily summary
- final recommendation pack

### Worker Lanes

#### Lane 1: Release Evidence

Owns:

- release-gate reports
- pilot evidence index integrity
- artifact references

#### Lane 2: Member And Funnel

Owns:

- registration
- activation
- Free Start
- claim start continuity

#### Lane 3: Agent Workflow

Owns:

- agent-assisted registration
- handoff quality
- lead and member progression

#### Lane 4: Staff Operations

Owns:

- queue state
- claim detail state
- SLA behavior
- accepted-case enforcement
- messaging persistence

#### Lane 5: Branch Ops

Owns:

- branch_manager visibility
- branch dashboard
- branch queue review
- branch-local escalation recommendation

#### Lane 6: Security And Privacy

Owns:

- tenant isolation
- branch scoping
- aggregate-only dashboard proof
- RBAC denials

#### Lane 7: Communications

Owns:

- email
- in-app messaging
- voice intake if pilot-critical
- WhatsApp or hotline routing if operationally real

#### Lane 8: Observability

Owns:

- logs
- incident classification
- severity tagging
- stop criteria checks

## Master Tracks

The 14-day program should be organized as four tracks.

### Track A: Readiness And Artifact Proof

Focus:

- release-gate proof
- pilot artifact generation
- rollback target discipline
- operator flow correctness

### Track B: Simulated Scenario Rehearsal

Focus:

- core operational scenarios using seeded data
- branch-manager and admin decision flow
- commercial and pilot-governance proof

### Track C: Enterprise Stress And Boundary Validation

Focus:

- multi-tenant load
- branch-local backlog
- privacy and RBAC boundaries
- communication reliability

### Track D: Executive Review And Launch Decision

Focus:

- evidence review
- continue or pause or stop decision
- handoff into controlled live pilot if approved

## 14-Day Plan

### Day 1: Release Gate Baseline

Objective:

- prove release-gate machinery is green and artifacts are produced correctly

Primary checks:

- release report generation
- pilot evidence index creation
- pointer row creation
- operator command flow sanity

Expected decision:

- `continue`

### Day 2: Pilot-Ready Rollback Baseline

Objective:

- prove rollback target and re-validation path are usable

Primary checks:

- pilot-ready tag reference
- rollback target recording
- re-validation command path

Expected decision:

- `continue`

### Day 3: Branch Escalation Workflow Rehearsal

Objective:

- prove branch_manager to admin oversight chain works as intended

Primary checks:

- branch queue visibility
- branch-local recommendation
- admin receives final decision context

Expected decision:

- `continue`

### Day 4: Green-Day Closed Loop

Objective:

- run a normal member -> agent -> staff -> branch_manager -> admin flow

Primary checks:

- claim intake
- agent handoff
- staff triage
- branch review
- admin confirmation

Expected decision:

- `continue`

### Day 5: Missing-Information SLA Waiting State

Objective:

- prove SLA waiting behavior is correct when evidence is incomplete

Primary checks:

- waiting SLA state
- member-visible copy
- staff handling
- branch_manager visibility

Expected decision:

- `continue`

### Day 6: Accepted Recovery Ready Path

Objective:

- prove accepted recovery can move forward when prerequisites are complete

Primary checks:

- signed agreement
- collection path ready
- claim detail readiness

Expected decision:

- `continue`

### Day 7: Accepted Recovery Blocked Path

Objective:

- prove accepted recovery stays blocked when agreement or collection is missing

Primary checks:

- blocked prerequisite state
- staff visibility
- branch and admin awareness if needed

Expected decision:

- `continue`

### Day 8: Guidance-Only Enforcement

Objective:

- prove non-monetary matters stay outside success-fee handling

Primary checks:

- guidance-only restriction
- referral-only boundary
- no illegal recovery transition

Expected decision:

- `continue`

### Day 9: Multi-Tenant Registration Stress

Objective:

- prove large-volume member registration across multiple tenants in one operating window

Primary checks:

- tenant attribution
- branch attribution
- no leakage
- no duplicate commercial state

Expected decision:

- `continue`

### Day 10: Branch Backlog And Queue Pressure

Objective:

- prove branch-local backlog handling and escalation behavior

Primary checks:

- staff queue pressure
- branch_manager oversight
- branch recommendation
- admin decision support

Expected decision:

- `defer` or `continue with owner`

### Day 11: Privacy And RBAC Boundary Day

Objective:

- prove cross-tenant, cross-branch, and aggregate-only protections under pressure

Primary checks:

- RBAC denial
- cross-tenant denial
- branch mismatch denial
- group dashboard privacy

Expected decision:

- `continue`

### Day 12: Communications Reliability Day

Objective:

- prove communication-critical pilot channels

Primary checks:

- email for pilot-critical events
- in-app messaging
- voice intake if used in pilot
- WhatsApp or hotline routing if used in pilot
- fallback behavior

Expected decision:

- `continue`

### Day 13: Incident And Rollback Drill

Objective:

- simulate amber and red incident handling

Primary checks:

- observability review
- severity classification
- stop criteria handling
- rollback recommendation path
- resume conditions

Expected decision:

- `hotfix` or `stop`

### Day 14: Executive Review Day

Objective:

- make the enterprise-style pilot decision

Review inputs:

- release reports
- evidence index
- branch_manager recommendations
- admin decision history
- incident pattern
- KPI condition

Final decisions:

- `expand`
- `repeat_with_fixes`
- `pause`
- `stop`

## Core Scenario Library

The 14-day plan should use the following scenario IDs.

### Core Scenarios

- `PD01` release-gate green baseline
- `PD02` rollback baseline
- `PD03` branch escalation chain
- `PD04` normal green-day closed loop
- `PD05` missing-information SLA wait
- `PD06` accepted recovery ready
- `PD07` accepted recovery blocked
- `PD08` guidance-only enforcement
- `PD09` multi-tenant registration stress
- `PD10` branch backlog and SLA drift
- `PD11` privacy and RBAC boundary stress
- `PD12` communications reliability
- `PD13` incident stop and rollback
- `PD14` executive review

## Daily Artifact Contract

Each pilot day should produce:

1. release report path
2. pilot evidence index row
3. scenario summary
4. owner
5. status
6. incident count
7. highest severity
8. branch_manager recommendation when relevant
9. admin decision
10. rollback target if applicable

Operators may use `docs/pilot/PILOT_DAILY_SHEET_TEMPLATE.md` as the structured note-and-scoring companion for each day, but the copied `docs/pilot/PILOT_EVIDENCE_INDEX_<pilot-id>.md` file remains the canonical evidence record.

## Branch Manager Evidence Rules

Because `branch_manager` is part of the real operating model in this repo, the master pilot must treat it as a first-class evidence role.

When a scenario is branch-local or queue-related:

- the evidence must record whether the branch_manager reviewed it
- the branch_manager may recommend continue, defer, or escalation
- final stop or rollback decisions still belong to admin

This distinction is required so the pilot does not collapse branch-local judgment into admin-only decision logs.

## Parallelization Rules

### Parallel-Friendly Scenario Groups

- release artifact checks
- accepted-case ready and blocked checks
- guidance-only enforcement
- privacy and RBAC boundary checks
- communications checks
- registration stress variants

### Sequential Scenario Groups

- branch escalation chain
- backlog and SLA drift judgment
- incident stop and rollback drill
- executive review

Rule:

- parallelize only when seeded state and evidence outputs do not collide
- keep decision-bearing scenarios sequential

## Enterprise Success Criteria

The enterprise pilot rehearsal should be considered credible only if:

- every scenario produces canonical artifacts
- no cross-tenant or cross-branch leakage appears
- branch_manager oversight is represented explicitly where relevant
- stop and rollback decisions are evidence-backed
- readiness cadence and release evidence remain repo-verifiable

## Recommended Follow-On

After this master pilot testing blueprint is accepted:

1. map it to `P7` implementation and rehearsal work
2. build scenario seeds and runbooks
3. run the enterprise pilot rehearsal
4. then decide whether to promote a controlled live pilot or a post-pilot UX tranche

The recommended next planning artifact after this one is:

- a `Master Pilot Scenario Pack` with concrete seed IDs, owners, commands, and expected outputs for `PD01` through `PD14`
