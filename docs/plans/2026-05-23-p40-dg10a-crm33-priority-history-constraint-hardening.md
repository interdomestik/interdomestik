# P40-DG10A CRM33 Priority History Constraint Hardening Decision

Status: complete
Slice: `P40-DG10A`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-23
Authority: approved hardening decision. This decision amends `P40-DG10` only to authorize the
minimum database task-history constraint widening required for
`P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. In completion state tables,
`promoted` means implementation-approved but not yet started; the tracker records the corresponding
implementation status as `pending`. Tracker queue statuses remain the repo-audited values
`completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this decision.

## Revision History

| Revision | Date       | Notes                                                                                          |
| -------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-23 | Narrow CRM33 implementation blocker triage after DG10 promotion and before CRM33 runtime work. |
| `r2`     | 2026-05-23 | Review hardening for promoted vocabulary, explicit constraint allowlists, migration naming, concrete proof cases, and symmetric CRM33 authorization wording. |

## Blocker

`P40-DG10` authorizes CRM33 to add:

- task-history event `priority_updated`;
- stable reason code `manual_priority_change`;
- CRM26-style persistence through `CrmTaskRepository.saveTask`.

Current persistence checks reject those values:

- `packages/database/src/schema/crm.ts` keeps `crm_task_history_event_check` limited to the
  pre-CRM33 event set and does not include `priority_updated`;
- `packages/database/src/schema/crm.ts` keeps `crm_task_history_reason_code_check` limited to the
  pre-CRM33 reason-code set and does not include `manual_priority_change`;
- `packages/database/drizzle/0065_crm_task_persistence.sql` records the same historical
  constraint values for the original task-history table definition.

Without a bounded schema hardening authorization, the CRM33 runtime mutation would pass domain and
CRM26 validation but fail when appending the task-history row.

## Decision

Authorize exactly one additional implementation allowance for `P40-CRM33`:

- widen the active Drizzle `crm_task_history_event_check` definition to include
  `priority_updated`; the full authorized allowlist after widening is:
  `'created', 'assigned', 'reassigned', 'due_updated', 'started', 'completed', 'cancelled',
  'reopened', 'priority_updated'`;
- widen the active Drizzle `crm_task_history_reason_code_check` definition to include
  `manual_priority_change`; the full authorized allowlist after widening appends
  `'manual_priority_change'` to the existing pre-CRM33 reason-code set;
- add one additive migration (expected filename prefix `0066_...`) that drops and recreates only
  those two `crm_task_history` check constraints with the widened allowlists; no data is
  rewritten and the migration is safe to re-run after a failed apply;
- update Drizzle migration metadata only as required by the repository migration workflow;
- add focused database/schema proof covering: (1) `priority_updated` accepted by the event check,
  (2) `manual_priority_change` accepted by the reason-code check, (3) all pre-CRM33 event and
  reason-code values still accepted after widening, and (4) at least one invalid value rejected
  by each widened check.

This is a narrow task-history enum/allowlist hardening allowance, not a general database slice.

## Boundaries

Authorized paths for the CRM33 implementation are expanded only to include:

- `packages/database/src/schema/crm.ts`;
- `packages/database/drizzle/**` files required for one additive constraint-widening migration and
  its metadata;
- focused database/schema tests required to prove the constraint allowlists.

Still blocked:

- new tables, columns, indexes, RLS policies, tenant functions, grants, backfills, destructive
  migrations, data rewrites, trigger changes, or broader task persistence redesign;
- task-history payload changes beyond the two CRM33 allowlist values;
- repository shape changes unless required by type fallout from the approved CRM33 mutation;
- proxy, canonical route, auth, tenancy, routing, Stripe, README, AGENTS.md, or broad
  architecture-doc changes.

## CRM33 Implementation Amendment

`P40-DG10` remains the implementation authority for CRM33. This decision amends only the DG10
sentence that said CRM33 should avoid database schema and migration changes.

**What DG10A additionally authorizes:** CRM33 may now include the minimum `crm_task_history`
check-constraint widening — schema changes to `packages/database/src/schema/crm.ts` and one
additive migration — required for `priority_updated` and `manual_priority_change` to persist.

**The amended avoidance rule:** CRM33 should avoid database schema, migrations, RLS, CRM task
repository shape, work-queue DTO shapes, completed-queue DTO shapes, route groups, and
proxy/routing/auth/tenancy layers, except for the specific `crm_task_history` check-constraint
widening authorized by `P40-DG10A`.

CRM33 must continue to preserve:

- row-local priority controls only on visible, assigned, open, lead-backed `/agent/crm` task queue
  rows;
- `apps/web/src/proxy.ts` and canonical routes;
- CRM26 audit/rate-limit/lifecycle-version/revalidation semantics;
- existing Start/Complete, due-date, cancellation, completed recovery, lead links, queue markers,
  and legacy due-follow-up separation.

## Acceptance Criteria

- DG10A is recorded as `complete`.
- `current-program.md` and `current-tracker.md` record DG10A as the narrow CRM33 hardening
  amendment.
- CRM33 implementation may include only the minimal task-history constraint widening needed for
  `priority_updated` and `manual_priority_change`.
- No table, column, index, RLS, tenant-function, grant, trigger, backfill, destructive migration,
  proxy, route, auth, tenancy, Stripe, README, AGENTS.md, or architecture-doc change is authorized
  by this decision.

## Verification Proof For This Decision

Before opening the promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check` if the docs/tracker/program text crosses the current budget.

Also run `pnpm ci:local:quick` if available in the active environment. If the dedicated worktree
cannot resolve dependencies, report the exact blocker and run the strongest available
docs/tracker fallback from a dependency-ready checkout.

## Completion State

| Item                                                              | Status   | Evidence                                                                 |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `P40-DG10 CRM Task Queue Priority Adjustment Controls Design Gate` | complete | PR `#850`, merge commit `48a39bdf4e9760f89f42e5d18f113b7188564c19`.   |
| `P40-DG10A CRM33 Priority History Constraint Hardening Decision`   | complete | This document; narrow hardening amendment for CRM33 implementation.     |
| `P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`      | promoted | DG10 remains authority; DG10A authorizes only the DB constraint widening. |

## Authorized Constraint Values After Widening

For auditing purposes the exact post-DG10A constraint `IN` lists are:

`crm_task_history_event_check`:
`'created', 'assigned', 'reassigned', 'due_updated', 'started', 'completed', 'cancelled',
'reopened', 'priority_updated'`

`crm_task_history_reason_code_check`:
`'manual', 'follow_up', 'support_handoff', 'assistance_review', 'data_quality',
'manual_assignment', 'reassignment', 'workload_balance', 'due_date_changed', 'due_date_cleared',
'manual_start', 'resolved', 'no_longer_needed', 'duplicate', 'converted', 'manually_closed',
'not_needed', 'created_in_error', 'subject_closed', 'follow_up_required', 'incomplete',
'manually_reopened', 'manual_priority_change'`

`P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls` remains the sole promoted
implementation slice. The CRM33 implementation is now authorized to include only the minimal
`crm_task_history` check-constraint widening needed for the DG10-approved priority event and reason
code. No value outside the two lists above may be added by CRM33.
