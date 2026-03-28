# v1.0.0 Bounded Continuation Plan

This plan implements the next four follow-up requirements for the `v1.0.0` pilot window:

1. keep the pilot scope narrow
2. prove clean operation without post-hoc repair
3. focus the objective on progression, not just triage/update SLA
4. rerun the Day 5 privacy / RBAC checks against the corrected baseline

## Scope

Keep the next live window intentionally narrow:

- `1` tenant: `KS`
- `1` branch authority line
- `1` staff operator
- `2` agents
- `20–50` members
- no scope growth during the window

Use the same functional role chain from the pilot runbook:

`Member submits claim -> Agent assists -> Staff triages/updates -> Admin monitors/intervenes`

## Primary Objective

The next window is successful only if it proves clean pilot operation without evidence repair.

That means:

- no post-hoc canonical data repair
- no evidence custody ambiguity
- no manual reinterpretation of which artifact is authoritative
- no late repair loop needed to justify the final recommendation

This directly addresses the weakness documented in:

- `docs/pilot/PILOT_WEEK1_KPI_ROLLUP_pilot-ks-live-2026-03-18.md`
- `docs/pilot/PILOT_EXEC_REVIEW_pilot-ks-live-2026-03-18.md`

## Operational Objective

Do not treat triage/update SLA alone as sufficient.

The next window must also improve `2 Operating-Day Progression Rate`, which historically missed badly:

- historical result: `24 / 53 = 45.3%`
- target from `docs/pilot/PILOT_KPIS.md`: `>= 85%`

The next live window should be judged with the following minimum scorecard:

| Area                                         | Required result                                                     |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Triage SLA                                   | `>= 90%` within target                                              |
| Public Update SLA                            | `>= 90%` within target                                              |
| 2 Operating-Day Progression                  | materially improved and target-seeking; `>= 85%` is the formal goal |
| Evidence custody                             | no repair loop                                                      |
| Sev1 incidents                               | `0`                                                                 |
| Sev2 unresolved older than one operating day | `0`                                                                 |

## Required Privacy / RBAC Rerun

Rerun the Day 5 privacy / RBAC / multi-tenant stress scenario on the corrected baseline before any expansion discussion.

Canonical scenario source:

- `docs/pilot/scenarios/PD05-privacy-rbac-multi-tenant-stress.md`

Required pass conditions:

1. no cross-tenant leak
2. no cross-branch leak
3. aggregate-only boundaries hold
4. registration attribution stays reliable
5. the evidence is recorded cleanly on the new pilot id without repair

## Daily Operating Rules

For the bounded continuation window:

- record evidence on the same day it is observed
- record observability before the matching decision row
- use the copied evidence index as canonical state
- keep the daily sheet as working state only
- stop the window if custody or privacy becomes ambiguous

## Exit Conditions

The bounded continuation window ends only in one of these ways:

1. `pause`
   Use when evidence is complete but progression or operating quality is still not strong enough to justify expansion.

2. `stop`
   Use immediately on privacy, data integrity, tenant isolation, or severe auth/session breakage.

3. `continue`
   Allowed only within the bounded window, not as implicit expansion approval.

4. `expand`
   Not available by default. Requires the executive gate in the companion decision document.
