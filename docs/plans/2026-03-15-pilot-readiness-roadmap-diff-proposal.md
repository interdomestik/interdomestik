---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-15
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# Pilot Readiness Roadmap Diff Proposal

> Status: Active supporting input. This document proposes the minimum promotion changes required to align live execution with `docs/plans/2026-03-15-pilot-readiness-blueprint-v1.md`. It does not commit work by itself.

## Recommendation

Do not jump from completed `P6` into a broad UI or UX redesign.

Promote one new tranche only:

- `P7` `Pilot Readiness And Release Evidence`

Reason:

- blueprint implementation is complete through `G10`
- the next unresolved launch risk is operational proof and evidence custody
- current pilot machinery exists, but it is still split across reports, docs, scripts, and partially manual evidence files

## No Reopen Rule

`P7` must not reopen:

- routing
- auth layering
- tenancy
- `apps/web/src/proxy.ts`
- broad product feature scope

`P7` is an operating-proof tranche, not a feature tranche.

`P7` should model the live pilot operating chain as member and agent activity, branch-manager branch-level oversight through admin surfaces, staff claim processing, and admin decision custody. This remains a governance-only refinement: `branch_manager` stays branch-scoped, stays on the admin portal, and stays read or oversight only on pilot staff claim surfaces.

## Required Current-Program Rebase

After completed `P6`, append this phase shape:

| Phase | Name                                  | Relative Timing      | Owner           | Purpose                                                                                    |
| ----- | ------------------------------------- | -------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `P7`  | Pilot Readiness And Release Evidence  | immediately after P6 | `platform + qa` | make pilot-entry proof, branch-level oversight evidence, and rollback discipline canonical |
| `P8`  | Pilot-Learned Trust And Activation UX | conditional after P7 | `web + design`  | improve conversion and trust surfaces using live pilot evidence, not opinion               |

`P8` should be listed as recommendation input only until `P7` is complete.

## Exact `P7` Work Items To Add

| ID    | Work                                                  | Exit Criteria                                                                                                                                                        |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R01` | Canonicalize the pilot-ready artifact set.            | Each pilot-entry run creates a release report, copied pilot evidence index, and canonical evidence row with stable references.                                       |
| `R02` | Unify readiness commands and outputs.                 | `pilot:check`, `release:gate:prod`, and `scripts/pilot-verify.sh` have documented authority and no ambiguous overlap.                                                |
| `R03` | Add deterministic pilot evidence capture.             | Daily pilot operations use one copied evidence index file with required status, severity, path, decision, and branch-level review context fields where relevant.     |
| `R04` | Add explicit continue, pause, hotfix, and stop proof. | Repo-backed decision artifacts distinguish branch-level recommendation from admin-level decision when applicable, including rollback target.                         |
| `R05` | Make pilot-ready tag discipline repo-verifiable.      | Rollback target and resume rules reference a real pilot-ready tag and fresh re-validation evidence.                                                                  |
| `R06` | Establish a modern readiness cadence.                 | A source-backed readiness streak or cadence is defined and replaces any need for historical A22-style inference.                                                     |
| `R07` | Tighten observability and incident evidence.          | Pilot evidence links log-sweep result, incident severity, KPI condition, and branch-local versus system-wide classification directly into decision-making artifacts. |
| `R08` | Publish one ranked operator flow for pilot entry.     | The repo has one clear pilot-entry command path covering pre-launch, gate proof, launch-day verification, branch-manager review or escalation, and daily logging.    |

## Proposed `current-program.md` Delta

After the sentence that says no further `G` item is committed after `G10`, add a new committed tranche:

`P7` `Pilot Readiness And Release Evidence` is now the next committed tranche after completed `P6`. `R01` through `R08` define the canonical pilot-entry artifact set, readiness command authority, daily evidence capture, branch-level recommendation versus admin-level decision proof, pilot-ready tag discipline, modern readiness cadence, observability evidence, and operator flow required before a live pilot is treated as governable across member, agent, branch-manager oversight, staff processing, and admin decision custody.

## Proposed `current-tracker.md` Delta

Add these rows after `G10`:

| ID    | Status    | Owner           | Work                                                  | Exit Criteria                                                                                                                                                        |
| ----- | --------- | --------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R01` | `pending` | `platform + qa` | Canonicalize the pilot-ready artifact set.            | Each pilot-entry run creates a release report, copied pilot evidence index, and canonical evidence row with stable references.                                       |
| `R02` | `pending` | `platform + qa` | Unify readiness commands and outputs.                 | `pilot:check`, `release:gate:prod`, and `scripts/pilot-verify.sh` have documented authority and no ambiguous overlap.                                                |
| `R03` | `pending` | `platform + qa` | Add deterministic pilot evidence capture.             | Daily pilot operations use one copied evidence index file with required status, severity, path, decision, and branch-level review context fields where relevant.     |
| `R04` | `pending` | `platform + qa` | Add explicit continue, pause, hotfix, and stop proof. | Repo-backed decision artifacts distinguish branch-level recommendation from admin-level decision when applicable, including rollback target.                         |
| `R05` | `pending` | `platform + qa` | Make pilot-ready tag discipline repo-verifiable.      | Rollback target and resume rules reference a real pilot-ready tag and fresh re-validation evidence.                                                                  |
| `R06` | `pending` | `platform + qa` | Establish a modern readiness cadence.                 | A source-backed readiness streak or cadence is defined and replaces any need for historical A22-style inference.                                                     |
| `R07` | `pending` | `platform + qa` | Tighten observability and incident evidence.          | Pilot evidence links log-sweep result, incident severity, KPI condition, and branch-local versus system-wide classification directly into decision-making artifacts. |
| `R08` | `pending` | `platform + qa` | Publish one ranked operator flow for pilot entry.     | The repo has one clear pilot-entry command path covering pre-launch, gate proof, launch-day verification, branch-manager review or escalation, and daily logging.    |

## Promotion Rule

Promote `P7` only after:

- `P6` is complete in both `current-program.md` and `current-tracker.md`
- `G07` through `G10` have repo-backed evidence

Those conditions are now met.

## Explicit Deferral

Do not promote a broad UI or UX redesign as the next canonical tranche.

Keep those ideas in the recommendation pool until:

- `P7` is complete
- pilot-entry proof is deterministic
- at least initial pilot evidence exists to guide what should be redesigned first

## Summary

The correct post-blueprint promotion is:

1. `P7` `Pilot Readiness And Release Evidence`
2. only after `P7`, consider `P8` `Pilot-Learned Trust And Activation UX`

This keeps governance clean, respects Phase C limits, and uses the blueprint machinery that has already been implemented instead of widening scope prematurely.
