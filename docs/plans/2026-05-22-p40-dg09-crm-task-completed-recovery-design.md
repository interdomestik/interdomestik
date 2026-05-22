# P40-DG09 CRM Task Queue Completed Task Recovery Design Gate

Status: complete
Slice: `P40-DG09`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-22
Authority: approved design gate. This gate promotes the next bounded implementation slice after
`P40-CRM31 Agent CRM Task Queue Cancellation Controls`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                                                                                                                                    |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `r1`     | 2026-05-22 | Initial review draft after `P40-CRM31` merged through PR `#847`.                                                                                                                                                         |
| `r2`     | 2026-05-22 | Review hardening for cancelled-task boundary, completed-queue DTO isolation, reopen reason exposure, confirmation UI, idempotency, audit metadata, i18n purity, focus, mobile layout, non-goals, and verification proof. |

## Definitions

- Completed task recovery: the bounded ability for an agent to reopen a recently completed,
  assigned, lead-backed CRM task back to `in_progress` through the existing CRM26
  `reopenCrmTaskAction` path.
- Terminal state: `completed` or `cancelled`. Only completed tasks are recoverable; cancelled tasks
  have no authorized transition in the domain state machine and must not be surfaced for reopen.
- Completed queue: a bounded, read-only, route-local read of the most recently completed tasks
  assigned to the current agent, limited to lead-backed tasks and a small row cap. This is distinct
  from the open work queue.
- Lifecycle version: the optimistic concurrency token already exposed by CRM task rows and the
  CRM28 queue DTO, required for the expected-version submit.
- CRM26 boundary: the existing CRM task application-service/server-action boundary in
  `apps/web/src/actions/crm-tasks.core.ts` and `apps/web/src/actions/crm-tasks.ts`.
- Reopen transition: the domain-authorized state transition `completed -> in_progress` recorded as
  a `reopened` event. The transition `cancelled -> [anything]` is not authorized by the domain
  state machine and must never be surfaced.
- Runtime task management: broad CRUD, assignment, reassignment, full task history, cross-role
  queues, staff/admin management, scheduler, reminders, notifications, templates, sequences,
  scoring, or automation. This is not promoted here.

## Predecessor Dependency

`P40-CRM31 Agent CRM Task Queue Cancellation Controls` is the direct predecessor.

Predecessor proof:

- `P40-DG08 CRM Task Queue Cancellation Controls Design Gate` is recorded in
  `docs/plans/2026-05-22-p40-dg08-crm-task-cancellation-controls-design.md`.
- `P40-CRM31` merged as PR `#847`, merge commit
  `f00a44b3ee4d1d701dc7ba5447db4326841754b0`, on 2026-05-22.
- PR `#847` added row-local inline cancellation controls with a reason picker to the existing
  `/agent/crm` CRM28/CRM29/CRM30 task queue for visible, assigned, open, lead-backed task rows only.
- PR `#847` exposed `not_needed`, `duplicate`, and `created_in_error` in the CRM31 UI-facing reason
  picker; `subject_closed` remains a domain reason code but was not exposed.
- PR `#847` reused CRM26 `cancelCrmTaskAction`, pinned expected lifecycle-version submission,
  required explicit row-local inline confirmation before submission, preserved Start/Complete
  controls, due-date controls, lead links, queue markers, legacy due-follow-up separation,
  canonical routes, and `apps/web/src/proxy.ts`.
- PR `#847` passed remote validation, audit, static, unit, full E2E, `e2e-gate`, Pilot Gate,
  gitleaks, pnpm-audit, PR finalizer, SonarCloud, Vercel ignored-build, and Vercel Preview
  Comments checks.

This promotion closes CRM31 in the repo-canonical `current-program.md` and
`current-tracker.md`, then authorizes only the next bounded implementation slice.

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
  `docs/plans/2026-05-22-p40-dg07-crm-task-queue-due-date-controls-design.md`, and
  `docs/plans/2026-05-22-p40-dg08-crm-task-cancellation-controls-design.md`.
- CRM task domain contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, `packages/domain-crm/src/tasks/work-queue.ts`,
  and `packages/domain-crm/src/tasks/index.ts`.
- CRM task runtime boundary: `apps/web/src/actions/crm-tasks.core.ts`,
  `apps/web/src/actions/crm-tasks.ts`, and `apps/web/src/actions/crm-tasks.core.test.ts`.
- CRM task queue UI: `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-cancel-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-cancellation-reasons.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-due-date-controls.tsx`, and
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-icon-button.tsx`.
- Existing migrated follow-up E2E proof: `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling active app
  locale files for `sq`, `sr`, and `mk`.

Codebase verification as of this gate:

- `reopenCrmTaskAction` exists in `apps/web/src/actions/crm-tasks.ts`.
- `reopenCrmTaskCore` exists in `apps/web/src/actions/crm-tasks.core.ts`.
- `reopenCrmTask` exists in `packages/domain-crm/src/tasks/state.ts`.
- The domain state machine in `CRM_TASK_ALLOWED_TRANSITIONS` authorizes
  `completed -> in_progress` and authorizes no transitions from `cancelled`.
- `reopenCrmTask` returns `terminal('terminal_state')` for cancelled input tasks; cancelled tasks
  are permanently blocked from reopen at the domain level.
- Domain reopen reason codes already exist: `follow_up_required`, `incomplete`, and
  `manually_reopened`.
- `CrmTask` already carries `reopenedAt` and `reopenReasonCode` fields.
- The existing `deriveCrmTaskWorkQueue` in `work-queue.ts` filters to
  `CRM_TASK_WORK_QUEUE_OPEN_STATUSES` (`pending` and `in_progress`); completed tasks do not appear
  in the open queue DTO.
- The open work queue DTO type `CrmTaskWorkQueueItem` pins status as
  `Extract<CrmTaskStatus, 'pending' | 'in_progress'>`; a separate completed-queue DTO is required
  and must not share this type.
- `CrmTaskWorkQueueInputRow` already carries the `lifecycleVersion` field needed for
  expected-version submission, but a completed-queue input row type must additionally carry
  `completedAt` and `completionReasonCode` for ordered read and display.
- CRM26 audit metadata sets `operation` to the same value as the task mutation event; reopen audit
  metadata must carry `operation: "reopened"`.
- The existing `CRM_TASK_REVALIDATION_PATHS` in `crm-tasks.core.ts` covers
  `/{locale}/agent/crm`, `/{locale}/staff/crm`, and `/{locale}/admin/crm`; no new paths are needed
  for CRM32 reopen.

## Decision

Propose exactly one next implementation slice:

`P40-CRM32 Agent CRM Task Queue Completed Task Recovery`

The proposed slice surfaces a bounded panel of recently completed, assigned, lead-backed CRM tasks
below the existing open work queue on `/agent/crm`, and adds row-local reopen controls that use the
existing CRM26 `reopenCrmTaskAction` path. It does not surface cancelled tasks, introduce task
creation, assignment, bulk actions, full task history, scheduler behavior, reminders,
notifications, or cross-role task UI.

## Candidate Ranking

| Rank | Candidate                                                | Decision | Rationale                                                                                                                                                                                        |
| ---- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P40-CRM32 Agent CRM Task Queue Completed Task Recovery` | Propose  | CRM31 lets agents close work; the next smallest useful operation is recovering work that was completed but still needs follow-up. The domain reopen contract already exists for completed tasks. |
| 2    | Cancelled task recovery                                  | Reject   | The domain state machine explicitly has `cancelled: []` with no authorized transitions. `reopenCrmTask` returns `terminal_state` for cancelled input.                                            |
| 3    | Full task history / completed task list                  | Defer    | A paginated history view is broader than the current bounded queue pattern and needs separate product design for filtering, scope, and pagination.                                               |
| 4    | `subject_closed` picker exposure in cancellation         | Defer    | Lead-closure semantics or a trusted `subjectStatus` queue DTO field remain unproduced; `subject_closed` stays blocked per DG08.                                                                  |
| 5    | Assignment / reassignment controls                       | Defer    | Reassignment needs actor-picker sourcing, branch/role visibility, assignment no-op copy, and stronger audit review.                                                                              |
| 6    | Queue filters, pagination, or broad task-list management | Defer    | The current queue is an active work surface; list management needs separate product ranking and empty/loading/error design.                                                                      |
| 7    | Scheduler / reminders / notifications                    | Defer    | Fanout requires cron, notification, retry, rate-limit, consent, and observability design.                                                                                                        |
| 8    | Staff / admin / member task surfaces                     | Defer    | Cross-role task surfaces need separate authorization design and separate product ranking.                                                                                                        |
| 9    | Assistance intent execution into CRM tasks               | Reject   | Assistance workflow intents remain advisory and `executionAllowed: false`; no assistance-to-CRM side effect is authorized.                                                                       |

## Proposed CRM32 Scope

Authorized implementation scope for CRM32:

- Add a bounded completed-task recovery panel to the existing `/agent/crm` page, rendered below the
  active open work queue.
- The panel shows only recently completed, assigned, lead-backed CRM tasks for the current agent.
- Limit the panel to a small row cap: 5 rows is the recommended default; the implementation may
  choose a value between 3 and 10 rows subject to layout and mobile proof.
- Show completed tasks ordered by most recently completed first (`completedAt` descending).
- Render one row-local Reopen control per completed task row.
- Use existing CRM26 server action `reopenCrmTaskAction`.
- Submit only `taskId`, expected `lifecycleVersion`, and a stable reopen reason code.
- Expose all three domain reopen reason codes in the CRM32 UI picker:
  - `follow_up_required` when additional follow-up is needed on the lead;
  - `incomplete` when the task was completed prematurely and work remains;
  - `manually_reopened` when the agent needs to reopen for a reason not captured by the other
    codes.
- Do not expose a free-text reopen reason field.
- Keep CRM32 non-optimistic: controls enter a disabled pending state until the server result
  returns.
- On success, rely on existing CRM26 locale-loop CRM revalidation and route refresh behavior. The
  reopened task returns to the open work queue and disappears from the completed panel after
  refresh.
- On stale lifecycle-version conflict, render a generic row-level conflict state that asks the user
  to refresh/retry without revealing hidden task existence.
- Keep existing Start/Complete controls, due-date controls, cancellation controls, lead link
  behavior, open queue count, and task queue markers stable.
- Never surface cancelled tasks in the completed panel. The completed panel must query only
  `status = 'completed'` rows and must not pass cancelled tasks through the reopen path.
- Add focused tests for reopen action wiring, reason-code validation, stale lifecycle-version
  behavior, cancelled-task rejection, terminal-state boundary, rate-limit and authorization result
  mapping, completed panel row visibility, no raw PII in labels/errors, focus behavior, and
  targeted agent CRM follow-up E2E gate behavior.

Expected implementation delta should stay focused on:

- A narrow domain-crm `CrmTaskCompletedQueueItem` type and `deriveCrmTaskCompletedQueue` helper,
  added to `packages/domain-crm/src/tasks/work-queue.ts` or a new
  `packages/domain-crm/src/tasks/completed-queue.ts`, exported through
  `packages/domain-crm/src/tasks/index.ts`;
- an app-side read adapter for completed queue rows at
  `apps/web/src/adapters/crm/task-completed-queue-repository.ts` or by extending the existing
  task-work-queue adapter if the shape is compatible without type pollution;
- `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts` extension for the completed queue read;
- a narrow route-local `task-queue-reopen-controls.tsx`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx` or a new
  `task-queue-completed-row.tsx` for the completed panel row layout;
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts` for the reopen action wrapper
  and result mapping;
- existing route-local task queue action/control tests;
- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` for the completed panel section and
  wiring;
- existing active agent CRM message files;
- targeted preservation or update of `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.

CRM32 should avoid changing `packages/domain-crm/src/tasks/state.ts`,
`apps/web/src/actions/crm-tasks*`, or database adapters unless implementation proves a small bug fix
is required. The reopen state machine, reason-code taxonomy, audit behavior, rate-limit behavior,
and revalidation behavior already exist.

## Completed-Queue DTO Contract

The completed-queue DTO must be a distinct type from `CrmTaskWorkQueueItem`. It must not share the
`status: Extract<CrmTaskStatus, 'pending' | 'in_progress'>` constraint.

Required fields on `CrmTaskCompletedQueueInputRow`:

- `assignedActorId: string | null` for actor filtering;
- `branchId: string | null` for branch filtering;
- `completedAt: string | null` for ordering and display;
- `completionReasonCode: CrmTaskCompletionReasonCode | null` for display;
- `dueAt: string | null` for contextual display only;
- `leadDisplayRef: CrmTaskWorkQueueLeadDisplayRef` for the lead link;
- `lifecycleVersion: number` for expected-version reopen submission;
- `priority: CrmTaskPriority` for display;
- `status: CrmTaskStatus`, which must equal `completed` after filtering;
- `subjectReference: CrmTaskSubjectReference` for lead-kind guard;
- `taskId: string` for row identity and action submission;
- `tenantId: string` for tenant filtering.

Required fields on `CrmTaskCompletedQueueItem`:

- `completedAt: string`, non-null after filtering;
- `completionReasonCode: CrmTaskCompletionReasonCode | null`;
- `dueAt: string | null`;
- `leadDisplayRef: CrmTaskWorkQueueLeadDisplayRef`;
- `lifecycleVersion: number`;
- `priority: CrmTaskPriority`;
- `status: Extract<CrmTaskStatus, 'completed'>`, pinned to `completed`;
- `subjectReference: { readonly id: string; readonly kind: 'lead' }`;
- `taskId: string`.

The `deriveCrmTaskCompletedQueue` helper must:

- accept `actorId`, `branchId`, `tenantId`, `limit`, and `rows` parameters matching the open-queue
  pattern;
- filter to rows where `tenantId`, `branchId`, and `assignedActorId` match the actor context,
  `subjectReference.kind === 'lead'`, `status === 'completed'`, and `completedAt` is non-null;
- sort by `completedAt` descending, most recently completed first;
- apply the row cap limit, defaulting to 5;
- return typed `CrmTaskCompletedQueueItem[]`.

The completed-queue DTO must not reuse `CRM_TASK_WORK_QUEUE_OPEN_STATUSES` or include `pending` or
`in_progress` rows. The open queue and completed queue must remain strictly separate derivation
paths. The two derivations may share input row columns where the shapes are compatible, but must not
share output item types.

## Reopen Control Contract

Controls must be derived from task status and visibility:

- `completed`: may show reopen in the completed panel.
- `pending` and `in_progress`: must not show reopen because they appear in the open queue.
- `cancelled`: must not appear in the completed panel and must not render reopen controls.
- Unsupported subject kinds: must not appear in the completed panel and must not render reopen
  controls.

Reopen controls render only when the row exists in the CRM32 completed queue DTO and `status` is
`completed`. The UI must not consult role, branch, actor, tenant, assignment, or subject-visibility
identity to decide whether to show these controls.

The client must not derive authorization. The submitted mutation must still pass through the CRM26
boundary, which re-resolves session-derived tenant, actor, role, branch, assignment, subject
visibility, and lifecycle-version checks before writing.

CRM32 must not add new domain reopen reason codes. The first UI slice should expose all three
existing domain reopen reason codes:

- `follow_up_required`: additional follow-up is needed on the lead;
- `incomplete`: the task was completed prematurely and work remains;
- `manually_reopened`: the agent needs to reopen for a reason not captured above.

CRM32 must not add free-text reason fields, note fields, comments, task titles, descriptions, or
localized reason strings to the domain boundary. Localized UI labels may explain existing stable
reason codes but must not be submitted as reason material.

Reopen is not undeletion. It updates task lifecycle metadata only and must not remove task history,
`crm_task_history` entries, or audit/history evidence.

CRM32 controls must render only on CRM32 completed-queue task rows. They must not render on legacy
due-follow-up entries, `crm_activities` compatibility rows, or open work queue rows.

## Confirmation And Interaction Contract

Reopen is a reversible lifecycle change because a reopened task can be cancelled or completed again,
but the UI should still require deliberate confirmation to avoid accidental reopens that pollute the
active work queue.

CRM32 must use a compact row-local inline confirmation surface, consistent with the CRM31
cancellation confirmation pattern. Do not introduce a modal, page-level dialog, or global alert
surface. The confirmation surface must use the existing row-local action grouping pattern with a
named `role="group"` region and the existing row-local `aria-live="polite"` message region for
pending and error copy. The confirmation surface must:

- name the action as reopening the task, not recreating or restoring it;
- require selecting one reopen reason code before Save/Confirm is enabled;
- offer a Cancel/Dismiss control that returns focus to the row-local reopen affordance;
- disable the Reopen control for the same row while reopening is pending;
- avoid disabling unrelated rows in the completed panel or the open work queue;
- announce pending, success, conflict, rate-limit, unavailable, and transient states through the
  existing row-local live region pattern;
- keep labels concise enough for dense desktop and mobile layouts.

On successful reopen, the row is expected to disappear from the completed panel after refresh
because the panel shows only completed-status rows. The reopened task returns to the open work queue.
Focus should move to the next remaining completed panel row, the previous row if no next row exists,
or the completed panel heading if the panel becomes empty after refresh.

If one browser tab completes, cancels, or changes a task while another tab has a reopen confirmation
open for the same row, the lifecycle-version bump invalidates the stale reopen submission. CRM32
must map that to the generic conflict bucket.

## Idempotency Contract

CRM32 must not accept caller-authored idempotency keys for reopen controls.

The existing CRM26 reopen path is lifecycle-version guarded. CRM32 should rely on duplicate-click
suppression plus expected lifecycle-version compare-and-set behavior rather than inventing
UI-supplied keys.

A second click or parallel-tab retry after successful reopen is expected to resolve as a lifecycle
conflict where the stale expected version no longer matches. The task is now `in_progress`, so the
expected completed-status version is stale. The UI must not expose whether the task became
`in_progress`, completed again, cancelled, or otherwise changed after the user's page loaded.

CRM32 does not have the same same-reason idempotency path that cancellation has, because reopen
transitions `completed -> in_progress` and the domain does not treat reopening as idempotent at the
action level. Duplicate submissions should resolve as lifecycle conflicts.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM32:

- Existing `/agent/crm` page and route-local component flow.
- Existing CRM26 `reopenCrmTaskAction`.
- Existing server action/core tests and targeted agent CRM E2E proof.

Unauthorized entrypoints:

- New `app/api/**/route.ts` HTTP route handlers.
- New `app/api/cron/crm/**/route.ts` cron route handlers.
- New route groups, route aliases, middleware, proxy edits, or canonical route rewrites.
- New `/member`, `/staff`, or `/admin` task UI or action surfaces.
- New assistance runtime UI or assistance-to-CRM execution surface.

`apps/web/src/proxy.ts` must remain untouched.

## Authorization And Data Boundary

- Mutations must derive tenant, actor, role, and branch scope from the authenticated session through
  the existing CRM26 action boundary.
- UI/client input must not be trusted for tenant id, branch id, role, actor id, assignment scope, or
  subject visibility.
- Agent actors remain branch-scoped.
- CRM32 completed panel rows must be derived from the same actor/tenant/branch scope used for the
  open queue: only tasks assigned to the current agent, within the current branch and tenant, with
  lead-backed subjects.
- The implementation must verify that the CRM26 action path still rejects tasks outside that scope
  through trusted repository/domain checks, or stop and promote a separate CRM26 hardening slice
  before adding the UI affordance.
- Staff/admin/member task controls are not introduced by CRM32.
- Invisible, absent, cross-tenant, cross-branch, unassigned, subject-invisible, cancelled, or
  unsupported-subject tasks must all fail closed through existing CRM26 result envelopes.
- User-facing error copy must not distinguish absent tasks from invisible tasks.
- Cancelled tasks must fail closed at both the read layer and the action layer: the completed panel
  query excludes them, and `reopenCrmTask` returns `terminal_state` for cancelled input.

## Domain Coupling Boundary

- CRM32 must use existing `@interdomestik/domain-crm/tasks` reopen helpers through the CRM26
  server-action boundary.
- A new `CrmTaskCompletedQueueItem` type and `deriveCrmTaskCompletedQueue` helper may be added to
  `packages/domain-crm/src/tasks/work-queue.ts` or a new
  `packages/domain-crm/src/tasks/completed-queue.ts`. These additions must be pure, stateless, and
  parameter-injected, matching the pattern of `deriveCrmTaskWorkQueue`.
- Route-local UI must not import database modules or mutate CRM task rows directly.
- Route-local UI may import only the public server actions or a narrow route-local action wrapper.
- `packages/domain-crm/src/tasks/*` must not import app code, database code, route code,
  localization, or rendering concerns.
- CRM32 must not create a parallel task lifecycle service outside the existing CRM26 boundary.
- CRM32 must not reintroduce legacy `crm_activities` writes or make reopen depend on legacy activity
  rows except through already-existing CRM27 compatibility behavior.
- UI components must not import `packages/domain-crm/src/tasks/*` directly for reopen decisions.
  They receive the CRM32 completed-queue DTO and call the CRM26 boundary or a route-local wrapper
  only.

## PII And Privacy Boundary

Reopen controls and result copy are operational metadata, not a place for raw customer or case
content.

Allowed UI/action material:

- stable localized labels for opening, confirming, dismissing, and submitting reopen;
- stable localized labels for all three reopen reason codes;
- task status, priority, due date, completion reason code label, and lead display ref label;
- task id and lifecycle version submitted to the existing action boundary;
- generic success, conflict, rate-limit, unavailable, invalid-reason, and retry copy.

Blocked UI/action material:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw user-authored task titles or descriptions;
- free-text reopen reasons;
- PII in action payload keys, idempotency keys, route params beyond existing lead id usage, audit
  metadata, logs, telemetry names, test snapshots, or error messages.

The completed panel rows may display the `completionReasonCode` as a localized, stable label for
context, but must not expose raw user-authored completion notes or task descriptions.

No AI behavior is introduced. CRM32 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## UI And Accessibility Contract

CRM32 is a bounded queue affordance, not a redesign.

- The existing `/agent/crm` route, layout, `agent-crm-page-ready` marker, and
  `agent-crm-task-queue-ready` marker must remain.
- The completed panel must be visually distinct from the open work queue; a separate section heading
  is required.
- The completed panel heading must not describe it as a general task history. A label like
  "Recently Completed" or equivalent in each active locale is appropriate.
- The completed panel must render below the open work queue and must not replace, overlay, or
  visually merge with it.
- Reopen controls must be keyboard reachable and screen-reader distinguishable by task row context.
- Confirmation must require a reason selection before the submit control is enabled.
- Pending submissions must prevent duplicate clicks for the same row/action.
- A pending or failed reopen mutation on one row must not disable, overwrite, or announce state for
  adjacent rows.
- Invalid-reason, conflict, terminal-state, and rate-limit states must be announced in an
  accessible, row-local way.
- Dismissing confirmation must return focus to a stable row-local control.
- Successful reopen should move focus to the next actionable completed panel row, the previous
  actionable row, or the completed panel heading if no row remains.
- The completed panel must render a stable empty state when no recently completed tasks exist.
- Stable E2E markers may be added for the completed panel surface, such as
  `agent-crm-task-completed-queue-ready`, `agent-crm-task-completed-queue-reopen`,
  `agent-crm-task-completed-queue-reopen-confirm`, and
  `agent-crm-task-completed-queue-reopen-reason`; add
  `agent-crm-task-completed-queue-reopen-dismiss` if the dismiss control is rendered separately.
  Markers must not embed task ids or PII-bearing values.
- Active app locale copy must be added for `sq`, `en`, `sr`, and `mk`.
- Reopen reason labels must be localized distinctly in each active app locale, not left as English
  fall-through. `pnpm i18n:check` and `pnpm i18n:purity:check` must stay green after the CRM32
  message additions.
- The completed panel must remain usable on mobile and dense desktop viewports. WCAG 2.1 AA is the
  review floor. The panel rows must wrap or stack in a predictable tab order on narrow viewports
  without horizontal scroll.

## Audit, Rate-Limit, And Revalidation Contract

CRM32 must rely on the existing CRM26 mutation boundary for:

- `logAuditEvent` audit records with `crm.task.reopened`;
- `enforceRateLimitForAction` mutation throttling;
- lifecycle-version compare-and-set behavior;
- locale-loop CRM revalidation.

The inherited CRM26 revalidation path set is `/{locale}/agent/crm`, `/{locale}/staff/crm`, and
`/{locale}/admin/crm` across active `LOCALES`, as defined by `CRM_TASK_REVALIDATION_PATHS` in
`apps/web/src/actions/crm-tasks.core.ts`. CRM32 must not add a new revalidation fanout unless the
implementation PR proves it is fixing a CRM26 bug.

For reopen, `operation` in the audit metadata must equal `"reopened"`. This mirrors the CRM26
metadata builder and should be treated as a review guard against audit metadata drift.

CRM32 must not add parallel audit logging, custom rate-limit bypasses, or route-local revalidation
outside the existing boundary unless the implementation PR explicitly justifies a bug fix in the
CRM26 action layer.

Inherited CRM26 audit metadata is non-PII and limited to the current CRM task mutation envelope:
`event`, `fromStatus`, `operation`, `reasonCode`, `replay`, `subjectKind`, and `toStatus`, with the
task id carried as `entityId`. CRM32 must not add route-local audit metadata containing lead labels,
task titles, previous or next due dates, free-text reasons, or user-authored content.

## Side-Effect Contract

CRM32 may only reopen existing completed CRM tasks through the CRM26 boundary.

It must not add:

- cancelled-task reopen;
- task create, assign, cancel, bulk action, drag/drop, or inline task content editing beyond the
  existing CRM29, CRM30, and CRM31 controls;
- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, calendar, or outbox events;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill;
- task title/description/content persistence;
- deletion of CRM tasks, CRM task history, or legacy CRM activity rows.

## Fail-Closed Rules

CRM32 must fail closed when:

- no authenticated agent session is available;
- tenant, actor, role, or branch scope cannot be derived from trusted session context;
- the target task is absent, invisible, cross-tenant, cross-branch, unassigned, terminal
  (`cancelled`), unsupported, or subject-invisible;
- the task subject is not `lead`;
- the submitted lifecycle version is stale;
- the submitted reopen reason is missing or not one of the three CRM32 UI-exposed reopen reason
  codes;
- the completed panel receives a row where `status === 'cancelled'`; this must never reach the
  reopen action and must be excluded at the completed-queue derivation layer;
- the mutation would require raw lead notes, follow-up free text, case narrative, medical facts,
  legal strategy, insurer correspondence, assistance summaries, document text, or AI output;
- implementation would require a new route, proxy edit, scheduler, notification, outbox, schema/RLS,
  auth, tenancy, routing, or architecture change.

Fail-closed UI for visibility and authorization denials must use a generic unavailable state and
must not distinguish absent from invisible work items.

## Result-To-Copy Mapping

CRM32 must map CRM26 results and domain denial reasons into stable, localized, non-PII UI buckets.
The UI should render bucketed copy only; it must not expose raw repository or denial reason strings.

| Copy bucket                         | Inputs mapped to the bucket                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue.reopen.error.unavailable`    | `unauthorized`, `forbidden`, `not_found`, `actor_scope`, `assignment_scope`, `branch_scope`, `role_scope`, `subject_not_found`, `subject_not_visible`, `subject_proof_missing`, `tenant_scope`, `invalid_assignment_target`, `invalid_priority`, `invalid_subject_reference`, `invalid_task_id`, `invalid_timestamp`, `non_monotonic_timestamp` |
| `queue.reopen.error.invalid_reason` | missing or unsupported reopen reason, `invalid_reason_code`                                                                                                                                                                                                                                                                                     |
| `queue.reopen.error.conflict`       | `conflict`, stale expected lifecycle version, `duplicate_idempotency_conflict`, `unsupported_transition`                                                                                                                                                                                                                                        |
| `queue.reopen.error.terminal`       | `terminal_state`, including attempts to reopen a cancelled task; this bucket must not reveal whether the conflict arose from a cancelled task or a stale version.                                                                                                                                                                               |
| `queue.reopen.error.rate_limited`   | CRM26 action rate-limit result                                                                                                                                                                                                                                                                                                                  |
| `queue.reopen.error.transient`      | `repository_failure` or other retryable infrastructure failure                                                                                                                                                                                                                                                                                  |

Success copy may name the task as reopened using stable action labels. Failure copy must not
distinguish absent work from invisible work, and must not distinguish a cancelled terminal block
from a stale lifecycle-version conflict.

## Non-Goals

- Cancelled task recovery or reopen of any kind.
- Staff/admin/member task queues or task-management surfaces.
- Task creation, assignment, bulk action, drag/drop, or inline task content editing.
- New routes, API endpoints, route groups, canonical route aliases, or proxy edits.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, calendar, or outbox emission.
- Full task history, paginated completed-task list, or task detail/timeline view.
- `subject_closed` cancellation picker exposure before lead-closure semantics or trusted queue DTO
  subject-status material are separately promoted.
- CRM templates, sequences, scoring, campaign automation, consent/preference implementation, or
  automated routing triggers.
- Historical data backfill, destructive migration, or deletion of legacy `crm_activities` rows.
- Account/contact/support-handoff/deal task subject rendering in the completed panel.
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

- `P40-CRM31` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#847` and merge commit `f00a44b3ee4d1d701dc7ba5447db4326841754b0`.
- DG09 promotes only `P40-CRM32 Agent CRM Task Queue Completed Task Recovery`.
- CRM32 adds a bounded completed-task recovery panel below the existing open work queue on the
  existing `/agent/crm` route.
- The completed panel renders only recently completed, assigned, lead-backed tasks for the current
  agent, capped to a small row limit between 3 and 10 rows, ordered by most recently completed
  first.
- Reopen uses existing `reopenCrmTaskAction`.
- Reopen requires one stable reopen reason code (`follow_up_required`, `incomplete`, or
  `manually_reopened`) and does not accept free text.
- The submitted action payload contains only task id, expected lifecycle version, and a stable
  reason code.
- CRM32 is non-optimistic: controls remain pending/disabled until the server result returns, and
  stale expected-version responses render a generic conflict state.
- Cancelled tasks are excluded from the completed panel at the derivation layer and cannot reach the
  reopen action; any `terminal_state` result from the domain maps to the
  `queue.reopen.error.terminal` copy bucket without revealing task visibility or cancellation state.
- Invalid-reason, stale lifecycle-version, terminal-state, rate-limit, unauthorized, forbidden,
  not-found, and repository-failure results render generic non-PII copy without hidden-task
  disclosure.
- CRM26 results and domain denial reasons are mapped into stable locale keys rather than raw
  low-level error strings.
- CRM32 verifies that reopen mutations cannot target tasks outside the current actor's assigned,
  completed, lead-backed scope through the trusted CRM26 path, or stops before implementation and
  promotes a CRM26 hardening slice.
- Existing Start/Complete controls, due-date controls, cancellation controls, lead links,
  open-queue count, legacy due-follow-up behavior, canonical routes, and clarity markers remain
  unchanged.
- Reopen controls never appear on open work queue rows, legacy due-follow-up entries, or
  `crm_activities` compatibility rows.
- Active app locale labels are present for `sq`, `en`, `sr`, and `mk`.
- Active app locale labels for the three reopen reasons pass `pnpm i18n:check` and
  `pnpm i18n:purity:check` without English fall-through regressions.
- The completed panel renders a stable empty state when no recently completed tasks exist.
- Mobile and dense desktop proof shows the completed panel renders and the row reopen controls wrap
  or stack with a stable tab order without horizontal scroll.
- Focused tests cover completed panel visibility, action payloads, reason validation, reason-code
  mapping, result mapping, duplicate-click suppression, stale lifecycle conflicts, cancelled-task
  exclusion at both read and action layers, terminal-state handling, PII-safe copy, accessibility
  basics, and targeted agent CRM E2E behavior.
- No cancelled-task reopen, assignment, staff/admin/member task UI, new routes, scheduler, reminder,
  notification, outbox, assistance execution, database migration/RLS, proxy, auth, tenancy, Stripe,
  README, AGENTS.md, or broad architecture-doc change is included.

## Implementation Review Plan

The CRM32 implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: no caller-supplied authority, no raw PII/case content in labels, payloads,
  errors, logs, telemetry, or snapshots; absent vs. invisible copy remains indistinguishable;
  cancelled tasks cannot reach the reopen action through any code path.
- Platform/runtime: existing CRM26 action boundary is reused; lifecycle-version conflicts,
  terminal-state handling, rate-limit behavior, audit events, result-to-copy mapping, and
  revalidation semantics remain consistent.
- Domain boundary: completed-queue DTO and `deriveCrmTaskCompletedQueue` are pure and isolated from
  the open work queue type; no parallel route-local lifecycle logic or database mutation path is
  introduced.
- Product/workflow: the completed panel is useful but bounded; full history, pagination, cancelled
  recovery, assignment, and scheduler work remain out of scope.
- QA/accessibility: existing gate behavior stays green, pending/disabled/conflict/invalid-reason
  states are usable, keyboard/screen-reader behavior is covered, completed panel empty state renders
  correctly, and existing clarity markers remain intact.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Decisions

- High: the completed panel surfaces previously invisible terminal-state tasks. The implementation
  must ensure the server-side completed queue read derives the same actor/tenant/branch/subject
  scope as the open queue; the CRM26 action must re-verify authorization independently of the read
  scope.
- High: cancelled tasks must never appear in the completed panel or reach the reopen action. The
  domain will return `terminal_state` for cancelled inputs, but the read layer must also exclude them
  so agents never see a control for a task that cannot be reopened.
- Medium: a recently reopened task disappears from the completed panel and reappears in the open
  queue after the next revalidation. Focus handling after successful reopen must remain stable.
- Medium: the completed panel adds a second section below the open queue. Mobile layout must be
  proven before merge. The panel must not introduce horizontal scroll or collapse to unreadable row
  width on narrow viewports.
- Medium: confusing `incomplete` reason code with `not_needed` or `created_in_error` from the CRM31
  cancellation reasons. CRM32 copy must clearly describe `incomplete` as task-level incompleteness,
  not lead-level or subject-level incompleteness.
- Low: agents may see a completed task disappear from the panel if another actor changes its status
  while the panel is open. Stale lifecycle-version behavior on submit is the mitigation.

Resolved review decisions:

1. CRM32 surfaces only completed tasks in the recovery panel; cancelled tasks have no authorized
   reopen path and must never appear in the panel.
2. All three domain reopen reason codes (`follow_up_required`, `incomplete`,
   `manually_reopened`) are exposed in the first CRM32 UI slice.
3. The completed panel is rendered as a distinct section below the open work queue with a clear
   heading and stable empty state.

## Verification Proof For This Design Gate

Before opening the promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check` and repo-size audit if the added design/tracker/program text crosses the
  current budget.

Also run `pnpm ci:local:quick` if available in the active environment. If the dedicated worktree
cannot resolve dependencies, report the exact blocker and run the strongest available docs/tracker
fallback from a dependency-ready checkout.

## Verification Plan For CRM32 Implementation

Focused implementation proof should include:

- route-local action tests for valid reopen, invalid input, unsupported/missing reason, stale
  lifecycle-version conflict, cancelled-task `terminal_state` mapping, not-found/forbidden/
  unavailable mapping, rate-limit mapping, repository-failure mapping, and no raw low-level reason
  leakage;
- component tests for completed panel row visibility, no panel rows for cancelled/open/legacy rows,
  required reason selection, confirmation dismiss behavior, duplicate-click suppression, row-local
  pending state, row-local conflict state, terminal-state copy bucket, and focus after
  success/failure;
- page tests proving the open work queue, Start/Complete controls, due-date controls, cancellation
  controls, lead links, queue count, and `agent-crm-task-queue-ready` remain stable when the
  completed panel is present;
- domain unit tests extending `packages/domain-crm/src/tasks` to cover
  `deriveCrmTaskCompletedQueue` filtering, ordering, row cap, and nil `completedAt` exclusion;
- existing `apps/web/src/actions/crm-tasks.core.test.ts` reopen coverage, extended only if a CRM26
  bug is discovered;
- `pnpm --filter @interdomestik/domain-crm test:unit` to keep existing reopen, cancellation, and
  lifecycle-version domain contracts green;
- active locale completeness and purity checks for `sq`, `en`, `sr`, and `mk` through
  `pnpm i18n:check` and `pnpm i18n:purity:check`;
- targeted Playwright proof for existing agent CRM follow-up behavior and the queue controls on
  supported locales, preserving canonical `/agent/crm` markers and extending to the completed panel
  if a completed-task fixture is available;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

The implementation PR must also run the Interdomestik implementation reviewer pool and a
diff-scoped security scan before required gates.

## Program/Tracker Promotion State

This promotion records the following repo-canonical state:

- This DG09 record is complete.
- `P40-CRM31` is complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md` using the predecessor proof above.
- Exactly one next implementation slice is promoted:
  `P40-CRM32 Agent CRM Task Queue Completed Task Recovery`.
- Changes stay scoped to `docs/plans`, tracker/program proof, and repo-size budget.
- Do not edit runtime code, tests, proxy, routes, auth, tenancy, schemas, migrations, Stripe,
  README, AGENTS.md, or architecture docs during the DG09 promotion.

## Completion State

| Item                                                          | Status     | Evidence                                                            |
| ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `P40-CRM31 Agent CRM Task Queue Cancellation Controls`        | `merged`   | PR `#847`, merge commit `f00a44b3ee4d1d701dc7ba5447db4326841754b0`. |
| `P40-DG09 CRM Task Queue Completed Task Recovery Design Gate` | `complete` | This document; promoted after r2 review hardening.                  |
| `P40-CRM32 Agent CRM Task Queue Completed Task Recovery`      | `promoted` | Sole next implementation slice authorized by this gate.             |

## Final Decision For Review

This gate promotes exactly one implementation slice:

`P40-CRM32 Agent CRM Task Queue Completed Task Recovery`

Implementation is authorized only within the scope and exclusions defined above.
