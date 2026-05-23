# P40-DG10 CRM Task Queue Priority Adjustment Controls Design Gate

Status: complete
Slice: `P40-DG10`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-23
Authority: approved design gate. This gate promotes the next bounded implementation slice after
`P40-CRM32 Agent CRM Task Queue Completed Task Recovery`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                         |
| -------- | ---------- | --------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-23 | Initial review draft after `P40-CRM32` merged through PR `#849`.                              |
| `r2`     | 2026-05-23 | Review hardening for stale lifecycle-version semantics, idempotent success, save-button behavior, success copy, i18n key reuse, pending visuals, scroll/focus behavior, return-code enumeration, and implementation verification breadth. |
| `r3`     | 2026-05-23 | DG10A amendment authorizes only the minimal `crm_task_history` check-constraint widening needed for CRM33 `priority_updated` and `manual_priority_change` persistence. |

## Definitions

- Priority adjustment: the bounded ability for an agent to change the priority of a visible,
  assigned, open, lead-backed CRM task row in the existing `/agent/crm` work queue.
- Open task: a task whose status is `pending` or `in_progress`, matching the existing
  `CrmTaskWorkQueueItem` output contract.
- Terminal task: a task whose status is `completed` or `cancelled`. CRM33 must not surface
  priority controls for terminal tasks, including rows in the completed-task recovery panel.
- Lifecycle version: the optimistic concurrency token already exposed by CRM task rows and the
  CRM28 queue DTO, required for expected-version submit.
- Stale lifecycle version: a lifecycle version submitted by the client that no longer matches the
  persisted task lifecycle version at mutation time, indicating a concurrent write occurred after
  the client loaded the queue. The CRM26 action must return a `conflict` result; the UI must render
  a generic conflict state without revealing the concurrent actor or the nature of the intervening
  change.
- Idempotent success: the result returned when the submitted target priority already equals the
  persisted task priority. The domain helper returns idempotent success, and CRM26 may audit that
  path with `replay: true`; it must not bump `lifecycleVersion`, append a history entry, or update
  `updatedAt`. The CRM26 rate limit still applies to same-priority submissions; the preferred UI
  prevents same-priority submissions to avoid unnecessary rate-limit consumption.
- CRM26 boundary: the CRM task application-service/server-action boundary in
  `apps/web/src/actions/crm-tasks.core.ts` and `apps/web/src/actions/crm-tasks.ts`.
- Priority mutation foundation: a narrow CRM26-style domain/core/action addition for priority
  updates only, required because no priority-update mutation exists today.
- Runtime task management: broad task CRUD, assignment, reassignment, full task history,
  cross-role queues, scheduler, reminders, notifications, templates, sequences, scoring, or
  automation. This is not promoted here.

## Predecessor Dependency

`P40-CRM32 Agent CRM Task Queue Completed Task Recovery` is the direct predecessor.

Predecessor proof:

- `P40-DG09 CRM Task Queue Completed Task Recovery Design Gate` is recorded in
  `docs/plans/2026-05-22-p40-dg09-crm-task-completed-recovery-design.md`.
- `P40-CRM32` merged as PR `#849`, merge commit
  `4c086bf3c8964549caa5a11e7bfa81b7c7f66b35`, on 2026-05-22.
- PR `#849` added a bounded completed-task recovery panel below the existing open work queue on
  `/agent/crm`, with a distinct completed-queue DTO for recently completed, assigned, lead-backed
  tasks for the current agent.
- PR `#849` reused CRM26 `reopenCrmTaskAction`, exposed `follow_up_required`, `incomplete`, and
  `manually_reopened`, excluded cancelled tasks from the completed panel, preserved open-queue
  Start/Complete controls, due-date controls, cancellation controls, lead links, legacy
  due-follow-up separation, canonical routes, and `apps/web/src/proxy.ts`.
- Remote checks were green before merge, including validation, audit, static, unit, full E2E,
  `e2e-gate`, Pilot Gate, gitleaks, pnpm-audit, PR finalizer, SonarCloud, Vercel ignored-build,
  and Vercel Preview Comments.

This promotion records the CRM32 closeout in the repo-canonical `current-program.md` and
`current-tracker.md`, then authorizes only the bounded CRM33 implementation slice.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior P40 gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`,
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`,
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`,
  `docs/plans/2026-05-21-p40-dg05-crm-task-work-queue-ui-foundation-design.md`,
  `docs/plans/2026-05-22-p40-dg06-crm-task-queue-lifecycle-controls-design.md`,
  `docs/plans/2026-05-22-p40-dg07-crm-task-queue-due-date-controls-design.md`,
  `docs/plans/2026-05-22-p40-dg08-crm-task-cancellation-controls-design.md`, and
  `docs/plans/2026-05-22-p40-dg09-crm-task-completed-recovery-design.md`.
- CRM task domain contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, `packages/domain-crm/src/tasks/work-queue.ts`,
  and `packages/domain-crm/src/tasks/index.ts`.
- CRM task runtime boundary: `apps/web/src/actions/crm-tasks.core.ts`,
  `apps/web/src/actions/crm-tasks.ts`, and `apps/web/src/actions/crm-tasks.core.test.ts`.
- CRM task persistence adapter: `apps/web/src/adapters/crm/task-repository.ts` and
  `apps/web/src/adapters/crm/task-repository.test.ts`.
- CRM task queue UI:
  `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-due-date-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-cancel-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-reopen-controls.tsx`, and
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-icon-button.tsx`.
- Existing migrated follow-up E2E proof: `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling active app
  locale files for `sq`, `sr`, and `mk`.

Codebase verification as of this draft:

- `CRM_TASK_PRIORITIES` exists in `packages/domain-crm/src/tasks/types.ts` and lists exactly
  `low`, `normal`, `high`, and `urgent`.
- `CrmTask.priority` exists and is persisted by `apps/web/src/adapters/crm/task-repository.ts`.
- `CrmTaskWorkQueueItem` and `CrmTaskCompletedQueueItem` both carry `priority` for display.
- `deriveCrmTaskWorkQueue` sorts open queue rows by due-date bucket, then priority rank
  `urgent`, `high`, `normal`, `low`, then task id.
- `/agent/crm` already renders localized priority labels for open rows and completed rows through
  `crm.taskQueue.priority.*` keys. CRM33 priority control labels must reuse these existing
  localization keys for the four priority values rather than introduce parallel key paths.
- `createCrmTask` validates priority at creation through `validatePriority`.
- No existing `updateCrmTaskPriorityAction`, `updateCrmTaskPriorityCore`, domain
  `updateCrmTaskPriority` helper, `CRM_TASK_PRIORITY_REASON_CODES`, or `priority_updated` event
  exists today.
- The generic CRM26 `runExistingTaskMutation` helper can support a priority mutation with the same
  rate-limit, actor construction, repository lookup, expected lifecycle-version persistence, audit,
  and locale-loop revalidation posture used by due-date, start, complete, cancel, and reopen.
- `CrmTaskRepository.saveTask` persists the full task aggregate, including `priority`, with
  tenant/branch-visible task lookup, subject visibility, and expected lifecycle-version guards.
- The existing `CRM_TASK_REVALIDATION_PATHS` in `crm-tasks.core.ts` covers
  `/{locale}/agent/crm`, `/{locale}/staff/crm`, and `/{locale}/admin/crm`; no new path is needed
  for CRM33 priority updates.
- `P40-DG10A CRM33 Priority History Constraint Hardening Decision` records that the active
  `crm_task_history` database checks reject the new CRM33 event/reason pair unless the history
  allowlists are widened. DG10A authorizes only that minimal constraint widening.

## Decision

Propose exactly one next implementation slice:

`P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`

The proposed slice adds a narrow CRM task priority mutation and row-local priority controls to
visible, assigned, open, lead-backed CRM task queue rows on the existing `/agent/crm` route. It does
not add assignment, task creation, full history, filters, pagination, scheduler behavior,
notifications, staff/admin/member task UI, or cross-role task management.

## Candidate Ranking

| Rank | Candidate                                                     | Decision | Rationale                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls` | Propose  | Priority is already displayed, persisted, and used for open-queue ordering. A narrow priority update is the smallest useful queue-management action after lifecycle, due-date, cancellation, and recovery. |
| 2    | Assignment / reassignment controls                            | Defer    | The `assignCrmTaskAction` boundary exists, but a safe UI needs actor-picker sourcing, branch/role visibility, empty states, assignment no-op copy, and stronger audit review.                            |
| 3    | Task creation from `/agent/crm`                               | Defer    | `createCrmTaskAction` exists, but creation needs title/content policy, lead selection, assignment defaults, idempotency UX, and product rules for when new manual tasks are allowed.                     |
| 4    | Full task history / completed task list                       | Defer    | A paginated history view is broader than a bounded work-queue control and needs filtering, pagination, terminal-state semantics, and separate empty/loading/error design.                                |
| 5    | Queue filters, pagination, or saved views                     | Defer    | Filtering and pagination change the work-queue read model and require list-management design rather than a row-local mutation slice.                                                                      |
| 6    | `subject_closed` cancellation picker exposure                 | Defer    | Lead-closure semantics or a trusted queue DTO subject-status field remain unpromoted.                                                                                                                     |
| 7    | Staff / admin / member task surfaces                          | Defer    | Cross-role task surfaces need separate authorization, row-scope, and product ranking design.                                                                                                               |
| 8    | Scheduler / reminders / notifications                         | Defer    | Fanout requires cron, notification, retry, rate-limit, consent, and observability design.                                                                                                                  |
| 9    | Assistance intent execution into CRM tasks                    | Reject   | Assistance workflow intents remain advisory and `executionAllowed: false`; no assistance-to-CRM side effect is authorized.                                                                                |

## Proposed CRM33 Scope

Authorized implementation scope for CRM33:

- Add a narrow domain CRM task priority mutation:
  - add `priority_updated` to `CRM_TASK_EVENT_KINDS`;
  - add `CRM_TASK_PRIORITY_REASON_CODES = ['manual_priority_change']`;
  - add a domain `updateCrmTaskPriority` helper that validates actor, tenant, branch, task status,
    target priority, reason code, and mutation timestamp;
  - return idempotent success with no lifecycle-version bump when the submitted priority equals the
    existing priority (see Definitions: Idempotent success);
  - reject terminal tasks through `terminal_state`;
  - reject invalid priority values through `invalid_priority`;
  - reject invalid reason codes through `invalid_reason_code`;
  - reject unauthorized actors through the existing `validateMutableTaskActor` path, returning the
    applicable scope denial reason to the CRM26 boundary.
- Add CRM26-style priority action plumbing:
  - `UpdateCrmTaskPriorityCoreInput` containing only `taskId`, `expectedLifecycleVersion`,
    `priority`, and stable `reasonCode`;
  - `updateCrmTaskPriorityCore` using `runExistingTaskMutation`;
  - `updateCrmTaskPriorityAction` in `apps/web/src/actions/crm-tasks.ts`;
  - audit fallback event `priority_updated`;
  - existing mutation rate-limit and locale-loop revalidation.
- Add row-local priority controls only to existing visible `/agent/crm` open work queue rows.
- Expose all four existing priority values in the control: `urgent`, `high`, `normal`, and `low`.
  Priority value labels must reuse the existing `crm.taskQueue.priority.*` localization keys
  already present for queue display; new key paths for the same four values must not be added.
- The route-local UI wrapper should pin `reasonCode: 'manual_priority_change'`; no user-facing
  reason picker or free-text priority reason is authorized.
- Submit only `taskId`, expected `lifecycleVersion`, target `priority`, and the stable reason code.
- Keep CRM33 non-optimistic: the changed priority must appear only after the server result and
  route refresh. While the mutation is in flight, the affected row must show a row-local pending
  state, such as a spinner on the save affordance and disabled controls for that row only. The
  pending state must not block other rows or the completed panel.
- On stale lifecycle-version conflict, render a generic row-level conflict state that asks the user
  to refresh or retry without revealing hidden task existence or concurrent actor details.
- Preserve existing Start/Complete controls, due-date controls, cancellation controls, lead links,
  queue markers, completed-task recovery panel, legacy due-follow-up separation, canonical routes,
  and `apps/web/src/proxy.ts`.
- Do not render priority controls on completed recovery rows, cancelled tasks, legacy due-follow-up
  rows, `crm_activities` compatibility rows, unsupported subject kinds, or hidden task rows.
- Add focused tests for domain priority mutation behavior, CRM26 action mapping, UI payloads,
  same-priority idempotency, terminal-state rejection, stale lifecycle-version handling, invalid
  priority handling, rate-limit and authorization mapping, PII-safe copy, focus behavior, and
  targeted agent CRM E2E behavior.

Expected implementation delta should stay focused on:

- `packages/domain-crm/src/tasks/types.ts`, `state.ts`, `mutations.ts`, and `index.ts` for the
  priority event, reason code, input type, and pure domain helper;
- existing domain task unit tests in `packages/domain-crm/src/tasks/index.test.ts` or a focused
  sibling test;
- `apps/web/src/actions/crm-tasks.core.ts`, `crm-tasks.ts`, and
  `crm-tasks.core.test.ts` for CRM26 priority action plumbing;
- route-local `/agent/crm` action/control files such as `task-queue-actions.ts` and a new
  `task-queue-priority-controls.tsx`;
- existing route-local task queue action/control/page tests;
- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` only for wiring the new control into
  open work queue rows;
- active app locale message files for `sq`, `en`, `sr`, and `mk`;
- targeted preservation or update of `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.

CRM33 should avoid changing database schema, migrations, RLS, CRM task repository shape, work-queue
DTO shapes, completed-queue DTO shapes, route groups, or proxy/routing/auth/tenancy layers, except
for the DG10A-authorized minimum `crm_task_history` check-constraint widening for
`priority_updated` and `manual_priority_change`.

## Priority Mutation Contract

The CRM33 domain mutation must mirror the established CRM task mutation style:

- Accept an existing `CrmTask`, trusted `CrmActorContext`, target `CrmTaskPriority`, and reason
  code `manual_priority_change`.
- Validate the actor with the same `validateMutableTaskActor` path used by existing task mutations;
  return the applicable scope denial reason (`actor_scope`, `assignment_scope`, `branch_scope`,
  `role_scope`, `tenant_scope`, `subject_not_found`, `subject_not_visible`, or
  `subject_proof_missing`) without revealing task existence to unauthorized callers.
- Allow only `pending` and `in_progress` tasks.
- Return `terminal_state` for `completed` or `cancelled` tasks.
- Return `invalid_priority` for unsupported priority input.
- Return `invalid_reason_code` for unsupported reason input.
- Return idempotent success when the requested priority equals the existing priority.
- For an actual change, append one history entry with event `priority_updated`, keep the task status
  unchanged, update `priority`, bump `lifecycleVersion`, and update `updatedAt`.
- Preserve `dueAt`, assignment, completion/cancellation/reopen metadata, subject reference,
  idempotency key, tenant id, branch id, and existing history.

The mutation must not reorder queue rows client-side before the server confirms the write. The open
queue already sorts by priority after dated status; the refreshed server read is the authority for
the new row order.

## Reopen And Completed-Panel Boundary

CRM33 is limited to open work queue rows.

- Completed recovery rows may continue to display priority as context, but must not expose priority
  edit controls.
- Reopened tasks return to the open work queue as `in_progress`; only after they are visible in the
  open queue may CRM33 priority controls appear.
- Cancelled tasks must never surface priority controls.
- CRM33 must not alter completed-queue derivation, completed-panel row cap, completed-panel empty
  state, reopen reason labels, or reopen result mapping.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM33:

- Existing `/agent/crm` page and route-local component flow.
- Existing CRM26 action/core pattern, extended narrowly with `updateCrmTaskPriorityAction`.
- Existing domain task aggregate and repository save path.
- Existing server action/core tests and targeted agent CRM E2E proof.

Unauthorized entrypoints:

- New `app/api/**/route.ts` HTTP route handlers.
- New `app/api/cron/crm/**/route.ts` cron route handlers.
- New route groups, route aliases, middleware, proxy edits, or canonical route rewrites.
- New `/member`, `/staff`, or `/admin` task UI or action surfaces.
- New assistance runtime UI or assistance-to-CRM execution surface.

`apps/web/src/proxy.ts` must remain untouched.

## Authorization And Data Boundary

Mutations must derive tenant, actor, role, and branch scope from the authenticated session through
the CRM26 action boundary.

UI/client input must not be trusted for tenant id, branch id, role, actor id, assignment scope, or
subject visibility.

CRM33 controls may render only when a row is already present in the CRM28/CRM29/CRM30/CRM31/CRM32
open queue DTO. The client must not derive authorization from role or tenant material; it only
renders controls for rows the server already made visible.

The CRM26 action must still re-resolve the task through trusted repository/domain checks before
writing. If implementation finds that CRM26 cannot reject cross-tenant, cross-branch, unassigned,
subject-invisible, terminal, or unsupported-subject priority updates, implementation must stop and
promote a CRM26 hardening slice before adding the UI affordance.

Invisible, absent, cross-tenant, cross-branch, unassigned, subject-invisible, terminal, or
unsupported-subject tasks must all fail closed through CRM26 result envelopes. User-facing error
copy must not distinguish absent tasks from invisible tasks.

## Domain Coupling Boundary

CRM33 may add a narrow priority mutation to `@interdomestik/domain-crm/tasks`. It must not create a
parallel task lifecycle service outside the existing task aggregate.

Route-local UI must not import database modules or mutate CRM task rows directly.

Route-local UI may import only the public server action, a route-local wrapper, and existing DTO
values already supplied by the server-rendered queue. UI components must not import
`packages/domain-crm/src/tasks/*` directly for authorization decisions.

`packages/domain-crm/src/tasks/*` must not import app code, database code, route code,
localization, or rendering concerns.

CRM33 must not reintroduce legacy `crm_activities` writes or make priority updates depend on
legacy activity rows.

## PII And Privacy Boundary

Priority controls and result copy are operational metadata, not a place for raw customer or case
content.

Allowed UI/action material:

- stable localized labels for opening, changing, saving, and dismissing priority controls;
- stable localized labels for `urgent`, `high`, `normal`, and `low`, reusing existing
  `crm.taskQueue.priority.*` keys;
- task status, current priority, due date, and lead display ref label already present in the queue;
- task id, lifecycle version, stable priority value, and stable reason code submitted to the CRM26
  action boundary;
- generic success, conflict, rate-limit, unavailable, terminal, invalid-priority, and transient
  copy.

Blocked UI/action material:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw user-authored task titles or descriptions;
- free-text priority reasons;
- PII in action payload keys, idempotency keys, route params beyond existing lead id usage, audit
  metadata, logs, telemetry names, test snapshots, or error messages.

No AI behavior is introduced. CRM33 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## UI And Accessibility Contract

CRM33 is a row-local queue affordance, not a redesign.

- The existing `/agent/crm` route, layout, `agent-crm-page-ready`,
  `agent-crm-task-queue-ready`, and `agent-crm-task-completed-queue-ready` markers must remain.
- The current priority label remains visible as row context.
- Priority controls must be keyboard reachable and screen-reader distinguishable by task row
  context.
- A compact row-local select or segmented control is acceptable; it must not open a page-level
  modal or global dialog. The control must be always visible inline within the open queue row
  rather than hidden behind a separate edit-mode trigger. This preserves consistent tab order,
  avoids a two-step interaction for a common queue-management action, and simplifies E2E anchoring.
- The control must include all four priority values and make the current priority clear.
- The save/submit control must be disabled when the selected priority equals the current priority.
  The preferred implementation does not allow same-priority submissions because same-priority
  submissions still count against the CRM26 mutation rate limit without producing a visible change.
  Implementation must not allow same-priority saves for parity with due-date behavior unless a
  CRM26 bug fix specifically requires it and is called out in the PR.
- Pending submissions must prevent duplicate clicks for the same row/action. While a priority
  mutation is in flight, the affected row's priority control and save affordance must be visibly
  disabled, such as with a spinner on the save button, to prevent duplicate submissions. The pending
  state is scoped to that row only and must not disable adjacent rows, the completed panel, or
  legacy due-follow-up entries.
- A pending or failed priority mutation on one row must not disable, overwrite, or announce state
  for adjacent rows, the completed panel, or legacy due-follow-up entries.
- Invalid-priority, conflict, terminal-state, rate-limit, unavailable, and transient states must be
  announced in an accessible row-local way.
- Dismissing the priority editor must return focus to a stable row-local priority affordance.
- Successful priority change should preserve focus on the changed row if still visible after
  refresh, move to the row's priority affordance if row ordering changes, or move to the open queue
  heading if the row no longer appears. When a successful priority change causes a row to reorder,
  the page scroll position should follow the focused row rather than jump to the top of the queue,
  so the agent retains visual context after the refresh.
- The completed panel remains a separate section below the open queue and must not receive priority
  controls.
- Stable E2E markers may be added, such as `agent-crm-task-queue-priority`,
  `agent-crm-task-queue-priority-select`, `agent-crm-task-queue-priority-save`, and
  `agent-crm-task-queue-priority-dismiss`. Markers must not embed task ids or PII-bearing values.
- Active app locale copy must be added for `sq`, `en`, `sr`, and `mk`. Priority value labels must
  reuse the existing `crm.taskQueue.priority.*` localization keys; new copy keys are required only
  for control actions, pending, success, and error states and must be distinct from existing
  queue-display keys.
- Priority labels and new priority-control copy must be localized distinctly in each active app
  locale, not left as English fall-through. `pnpm i18n:check` and
  `pnpm i18n:purity:check` must stay green.
- The open queue rows must remain usable on mobile and dense desktop viewports. Controls should
  wrap or stack with a stable tab order and without horizontal scroll.

## Audit, Rate-Limit, And Revalidation Contract

CRM33 must rely on the CRM26 mutation boundary for:

- `logAuditEvent` audit records with action `crm.task.priority_updated`;
- `enforceRateLimitForAction` mutation throttling;
- lifecycle-version compare-and-set behavior;
- locale-loop CRM revalidation.

For priority updates, `operation` in audit metadata must equal `priority_updated`. This mirrors the
CRM26 metadata builder where `operation` equals the event string.

Inherited CRM26 audit metadata is non-PII and limited to the current task mutation envelope:
`event`, `fromStatus`, `operation`, `reasonCode`, `replay`, `subjectKind`, and `toStatus`, with
the task id carried as `entityId`. CRM33 must not add route-local audit metadata containing lead
labels, task titles, previous or next due dates, previous or next priority labels, free-text
reasons, or user-authored content.

Same-priority idempotent replay may be audited with `replay: true`; it remains subject to the same
CRM26 mutation rate limit as other duplicate submissions. Because same-priority submissions consume
rate-limit budget without producing a visible change, the UI must disable the save control for
same-priority selections rather than allow the submission. This is the normative behavior; see the
UI and Accessibility Contract for the full save-button rule.

CRM33 must not add parallel audit logging, custom rate-limit bypasses, or route-local revalidation
outside the existing boundary unless the implementation PR explicitly justifies a CRM26 bug fix.

## Side-Effect Contract

CRM33 may only change the priority of existing open CRM tasks through the CRM26 boundary.

It must not add:

- task create, assign, reassign, cancel, reopen, bulk action, drag/drop, or inline task content
  editing beyond existing CRM29, CRM30, CRM31, and CRM32 controls;
- completed-row priority editing;
- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, calendar, or outbox events;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill;
- task title/description/content persistence;
- deletion of CRM tasks, CRM task history, or legacy CRM activity rows.

## Fail-Closed Rules

CRM33 must fail closed when:

- no authenticated agent session is available;
- tenant, actor, role, or branch scope cannot be derived from trusted session context;
- the target task is absent, invisible, cross-tenant, cross-branch, unassigned, terminal,
  unsupported, or subject-invisible;
- the task subject is not lead;
- the submitted lifecycle version is stale;
- the submitted priority is missing or not one of `urgent`, `high`, `normal`, or `low`;
- the submitted reason code is missing or not `manual_priority_change`;
- the completed panel receives a priority-control request, which must never happen through the UI;
- the mutation would require raw lead notes, follow-up free text, case narrative, medical facts,
  legal strategy, insurer correspondence, assistance summaries, document text, or AI output;
- implementation would require a new route, proxy edit, scheduler, notification, outbox,
  schema/RLS, auth, tenancy, routing, or architecture change.

Fail-closed UI for visibility and authorization denials must use a generic unavailable state and
must not distinguish absent from invisible work items.

## Result-To-Copy Mapping

CRM33 must map CRM26 results and domain denial reasons into stable, localized, non-PII UI buckets.
The UI should render bucketed copy only; it must not expose raw repository or denial reason
strings.

| Copy bucket                             | Inputs mapped to the bucket                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue.priority.success`                | successful priority update; idempotent same-priority reply is treated as success by the server but must not reach this bucket through normal UI operation because the UI prevents same-priority submission        |
| `queue.priority.error.unavailable`      | `unauthorized`, `forbidden`, `not_found`, `actor_scope`, `assignment_scope`, `branch_scope`, `role_scope`, `subject_not_found`, `subject_not_visible`, `subject_proof_missing`, `tenant_scope`                    |
| `queue.priority.error.invalid_priority` | missing priority, unsupported priority, `invalid_priority`, missing or unsupported reason code, `invalid_reason_code`                                                                                             |
| `queue.priority.error.conflict`         | `conflict`, stale expected lifecycle version, `duplicate_idempotency_conflict`, `unsupported_transition`                                                                                                          |
| `queue.priority.error.terminal`         | `terminal_state` for completed or cancelled tasks, without revealing whether the task completed, was cancelled, or became invisible after page load                                                                |
| `queue.priority.error.rate_limited`     | CRM26 action rate-limit result                                                                                                                                                                                    |
| `queue.priority.error.transient`        | `repository_failure` or other retryable infrastructure failure                                                                                                                                                     |

Success copy may name the task as updated using stable action labels. Failure copy must not
distinguish absent work from invisible work, and must not reveal concurrent actor details.

## Non-Goals

- Assignment or reassignment controls.
- Task creation from `/agent/crm`.
- Completed-row priority editing.
- Cancelled task recovery or reopen of any kind beyond existing CRM32 behavior.
- Staff/admin/member task queues or task-management surfaces.
- Bulk action, drag/drop ordering, queue filters, saved views, pagination, full task history, or a
  task detail/timeline view.
- New routes, API endpoints, route groups, canonical route aliases, or proxy edits.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, calendar, or outbox emission.
- `subject_closed` cancellation picker exposure before lead-closure semantics or trusted queue DTO
  subject-status material are separately promoted.
- CRM templates, sequences, scoring, campaign automation, consent/preference implementation, or
  automated routing triggers.
- Historical data backfill, destructive migration, or deletion of legacy `crm_activities` rows.
- Account/contact/support-handoff/deal task subject rendering in the priority-control surface.
- Assistance-session intent execution, CRM lead creation from assistance, claim creation,
  support-handoff creation, Professional Recovery activation, billing, finance, agreement, POA,
  assignment, or airline/insurer/third-party submission workflows.
- Database schema, migrations, RLS, or DB-access baseline changes.
- Task titles, descriptions, raw user-authored content, labels backed by free text, or task
  templates.
- Tenant timezone preference, business calendar, holiday calendar, recurring schedule model, SLA
  calendar, or reminder engine.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture,
  Stripe, README, AGENTS.md, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM32` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#849` and merge commit `4c086bf3c8964549caa5a11e7bfa81b7c7f66b35` before DG10 promotion.
- DG10 promotes only `P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`.
- CRM33 adds a narrow priority mutation event `priority_updated` and stable reason code
  `manual_priority_change`.
- CRM33 includes the DG10A-authorized database/schema migration delta only to widen
  `crm_task_history_event_check` for `priority_updated` and
  `crm_task_history_reason_code_check` for `manual_priority_change`.
- CRM33 adds `updateCrmTaskPriorityAction` through the CRM26 action/core pattern.
- Priority updates use only task id, expected lifecycle version, target priority, and stable reason
  code.
- Priority controls render only on visible, assigned, open, lead-backed `/agent/crm` task queue
  rows.
- The control exposes existing priority values `urgent`, `high`, `normal`, and `low` using the
  existing `crm.taskQueue.priority.*` localization keys for value labels.
- Priority controls are inline and always visible within open queue rows; they do not require a
  separate edit-mode trigger.
- The save affordance is disabled when the selected priority equals the current priority.
- While a priority mutation is in flight, the affected row shows a visible pending state such as a
  spinner and its controls are disabled; adjacent rows and the completed panel are unaffected.
- Same-priority submissions are idempotent and do not bump lifecycle version.
- Terminal tasks are rejected and map to non-disclosing terminal-state copy.
- Stale lifecycle-version responses render a generic conflict state.
- Invalid priority, invalid reason, rate-limit, unauthorized, forbidden, not-found, terminal, and
  repository-failure results render generic non-PII copy without hidden-task disclosure.
- Existing Start/Complete controls, due-date controls, cancellation controls, completed recovery
  controls, lead links, queue count, legacy due-follow-up behavior, canonical routes, and clarity
  markers remain unchanged.
- Priority controls never appear on completed recovery rows, legacy due-follow-up entries, or
  `crm_activities` compatibility rows.
- Active app locale labels are present for `sq`, `en`, `sr`, and `mk`; priority value labels reuse
  existing keys; new copy keys for control actions are localized distinctly and do not fall through
  to English.
- Active app locale labels pass `pnpm i18n:check` and `pnpm i18n:purity:check` without English
  fall-through regressions.
- Mobile and dense desktop proof shows the priority controls wrap or stack with a stable tab order
  and without horizontal scroll.
- Successful priority change that causes row reordering preserves scroll context near the changed
  row and moves focus to the row's priority affordance.
- Focused tests cover domain priority mutation behavior, action payloads, reason and priority
  validation, same-value idempotency, result mapping, duplicate-click suppression, stale lifecycle
  conflicts, terminal-state handling, PII-safe copy, accessibility basics, and targeted agent CRM
  E2E behavior.
- No assignment, task creation, completed-row editing, staff/admin/member task UI, new routes,
  scheduler, reminder, notification, outbox, assistance execution, database migration/RLS, proxy,
  auth, tenancy, Stripe, README, AGENTS.md, or broad architecture-doc change is included.

## Implementation Review Plan

The CRM33 implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: no caller-supplied authority, no raw PII/case content in labels, payloads,
  errors, logs, telemetry, or snapshots; absent vs. invisible copy remains indistinguishable.
- Platform/runtime: CRM26 action boundary is extended narrowly; lifecycle-version conflicts,
  terminal-state handling, rate-limit behavior, audit events, result-to-copy mapping, and
  revalidation semantics remain consistent.
- Domain boundary: priority mutation is pure, isolated to the CRM task aggregate, and does not
  create a parallel lifecycle service or database mutation path.
- Product/workflow: row-local priority changes improve queue triage without opening assignment,
  full history, filters, scheduler, or cross-role task management.
- QA/accessibility: existing gate behavior stays green, pending/disabled/conflict/invalid states
  are usable, keyboard/screen-reader behavior is covered, scroll-and-focus behavior after row
  reorder is verified, and existing clarity markers remain intact.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Decisions

- High: adding a new domain event can create audit drift. The implementation must pin
  `operation: "priority_updated"` and keep audit metadata limited to the existing non-PII task
  mutation envelope.
- High: priority controls could be mistaken for drag/drop queue ordering. CRM33 changes only the
  persisted priority field and relies on the server-refreshed queue ordering; it does not add manual
  row ordering.
- Medium: priority edits can reorder the row after refresh. Focus and scroll handling must remain
  stable if the changed row moves.
- Medium: adding another row-local control may crowd mobile layouts. The implementation must prove
  wrapping or stacking on narrow viewports without horizontal scroll.
- Medium: same-priority submissions can create noisy audit and consume rate-limit budget if blindly
  submitted. The save control must be disabled when the selected value equals the current priority;
  the server still treats same-priority submissions as idempotent if one arrives.
- Low: completed recovery rows already display priority. CRM33 keeps that read-only and limits
  priority controls to open queue rows.

Resolved review decisions:

- CRM33 is the next proposed slice because priority is already in the queue DTO, UI labels, and
  sort order.
- CRM33 may add the missing priority mutation foundation; it is bounded to the existing task
  aggregate, CRM26 action pattern, and repository save path.
- The first priority-control slice uses only one stable reason code: `manual_priority_change`.
- No free-text reason, scheduler, assignment, full task history, or cross-role task UI is included.
- Priority controls are inline and always visible; no separate edit-mode trigger is introduced.
- The save control is disabled for same-priority selections; same-priority submissions must not
  reach the server under normal UI operation.

## Verification Proof For This Design Gate

Before opening a promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check` and repo-size audit if the added design/tracker/program text crosses the
  current budget.

Also run `pnpm ci:local:quick` if available in the active environment. If the dedicated worktree
cannot resolve dependencies, report the exact blocker and run the strongest available
docs/tracker fallback from a dependency-ready checkout.

## Verification Plan For CRM33 Implementation

Focused implementation proof should include:

- domain unit tests for `updateCrmTaskPriority`, covering valid priority changes, same-priority
  idempotency, invalid priority, invalid reason, terminal-state rejection, actor/tenant/branch
  denial, and lifecycle metadata preservation;
- CRM26 core/action tests for valid priority update, same-priority idempotent replay, stale
  lifecycle-version conflict, not-found/forbidden/unavailable mapping, invalid-priority mapping,
  terminal-state mapping, rate-limit mapping, repository-failure mapping, audit metadata, and no
  raw low-level reason leakage;
- route-local action tests for payload shape, stable reason pinning, result bucket mapping, and no
  PII-bearing copy;
- component tests for priority editor rendering, value selection, save disabled for same-priority,
  save disabled during pending mutation, dismiss behavior, duplicate-click suppression, row-local
  pending state with visible spinner or equivalent, conflict state, terminal-state copy bucket,
  focus after success/failure, and scroll-position preservation when a row reorders after a
  successful change;
- page tests proving the open work queue, completed recovery panel, Start/Complete controls,
  due-date controls, cancellation controls, reopen controls, lead links, queue count, and
  `agent-crm-task-queue-ready` markers remain stable;
- `pnpm --filter @interdomestik/domain-crm test:unit`;
- `pnpm typecheck`, or the project-canonical type-check command across affected packages and the
  web app;
- `pnpm lint`, or the project-canonical lint command across affected packages;
- `pnpm i18n:check` and `pnpm i18n:purity:check`;
- targeted Playwright proof for existing agent CRM follow-up behavior and queue controls on
  supported locales;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.
- `pnpm ci:local:quick` if available in the active environment.

The implementation PR must also run the Interdomestik implementation reviewer pool and a
diff-scoped security scan before required gates.

## Program/Tracker Promotion State

This promotion records the following repo-canonical state:

- `P40-CRM32` is recorded as complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md` using PR `#849` and merge commit
  `4c086bf3c8964549caa5a11e7bfa81b7c7f66b35`.
- `P40-DG10` is complete.
- Exactly one next implementation slice is promoted:
  `P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`.
- Changes stay scoped to docs/plans, tracker/program proof, and repo-size budget.
- Do not edit runtime code, tests, proxy, routes, auth, tenancy, schemas, migrations, Stripe,
  README, AGENTS.md, or architecture docs during DG10 promotion. DG10A separately authorizes only
  the minimum schema/migration check-constraint widening during CRM33 implementation.

## Completion State

| Item                                                        | Status       | Evidence                                                                 |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `P40-CRM32 Agent CRM Task Queue Completed Task Recovery`     | merged       | PR `#849`, merge commit `4c086bf3c8964549caa5a11e7bfa81b7c7f66b35`.   |
| `P40-DG10 CRM Task Queue Priority Adjustment Controls Design Gate` | complete | This document; promoted after r2 review hardening.              |
| `P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls` | promoted | Sole next implementation slice authorized by this gate.          |

## Final Decision For Review

This gate promotes exactly one implementation slice:

`P40-CRM33 Agent CRM Task Queue Priority Adjustment Controls`

Implementation is authorized only within the scope and exclusions defined above.
