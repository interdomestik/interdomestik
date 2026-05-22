# P40-DG08 CRM Task Queue Cancellation Controls Design Gate

Status: complete
Slice: `P40-DG08`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-22
Authority: approved design gate. This gate promotes the next bounded implementation slice after
`P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                   |
| -------- | ---------- | --------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-22 | Initial review draft after `P40-CRM30` merged through PR #845.                          |
| `r2`     | 2026-05-22 | Review hardening for reopen semantics, cancellation reason exposure, idempotency, confirmation UI, audit metadata, i18n purity, revalidation limits, mobile layout, and verification proof. |

## Definitions

- Cancellation controls: bounded UI controls that let an authorized actor cancel a visible CRM
  task through the existing CRM26 `cancelCrmTaskAction` path.
- Domain cancellation reason: one of the existing domain reason codes `not_needed`, `duplicate`,
  `created_in_error`, or `subject_closed`.
- UI-exposed cancellation reason: one of the CRM31 picker reason codes `not_needed`, `duplicate`,
  or `created_in_error`. `subject_closed` exists in the domain boundary but is not exposed by the
  first queue UI slice.
- Terminal cancellation: the task state transition from `pending` or `in_progress` to
  `cancelled`. Cancelled tasks do not remain in the current open agent queue.
- Lifecycle version: the optimistic concurrency token already exposed by CRM task rows and the
  CRM28 queue DTO.
- CRM26 boundary: the existing CRM task application-service/server-action boundary in
  `apps/web/src/actions/crm-tasks.core.ts` and `apps/web/src/actions/crm-tasks.ts`.
- Runtime task management: broad CRUD, assignment, reopening, cross-role queues, staff/admin
  management, scheduler, reminders, notifications, templates, sequences, scoring, or automation.
  This is not promoted here.
- Assistance intent execution: turning `domain-assistance` workflow intents into CRM side effects.
  This remains blocked; P39 intent output is advisory and uses `executionAllowed: false`.

## Predecessor Dependency

`P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls` is the direct predecessor.

Predecessor proof:

- `P40-DG07 CRM Task Queue Due-Date Adjustment Controls Design Gate` is recorded in
  `docs/plans/2026-05-22-p40-dg07-crm-task-queue-due-date-controls-design.md`.
- `P40-CRM30` merged as PR `#845`, merge commit
  `fbfe70c8be9a69079784f6c7f9f31fab1be105c1`, on 2026-05-22.
- PR `#845` added row-local due-date edit/save/clear/cancel controls to the existing
  `/agent/crm` CRM28/CRM29 task queue for visible, assigned, open, lead-backed task rows only.
- PR `#845` reused CRM26 `updateCrmTaskDueAtAction`, pinned `due_date_changed` and
  `due_date_cleared`, preserved Start/Complete controls, lead links, queue markers, legacy
  due-follow-up separation, canonical routes, and `apps/web/src/proxy.ts`.
- PR `#845` addressed Copilot and Sonar follow-up before merge and passed remote validation,
  audit, static, unit, full E2E, `e2e-gate`, Pilot Gate, gitleaks, pnpm-audit, PR finalizer,
  SonarCloud, Vercel ignored-build, and Vercel Preview Comments.
- Focused local proof on the final head passed CRM task route-local action/control/core tests, web
  type-check, `pnpm security:guard`, and earlier full local required gates passed
  `pnpm pr:verify` and `pnpm e2e:gate`.
- Notion closeout is recorded at `https://www.notion.so/368036cff1f88197b809c03c6c2d3db3`.

This promotion closes CRM30 in the repo-canonical `current-program.md` and `current-tracker.md`,
then authorizes only the next bounded implementation slice.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior P40 gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`,
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`,
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`,
  `docs/plans/2026-05-21-p40-dg05-crm-task-work-queue-ui-foundation-design.md`,
  `docs/plans/2026-05-22-p40-dg06-crm-task-queue-lifecycle-controls-design.md`, and
  `docs/plans/2026-05-22-p40-dg07-crm-task-queue-due-date-controls-design.md`.
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
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-due-date-controls.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-icon-button.tsx`, and matching tests.
- Existing migrated follow-up E2E proof: `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling active app
  locale files for `sq`, `sr`, and `mk`.

Codebase verification as of this draft:

- `cancelCrmTaskAction` exists in `apps/web/src/actions/crm-tasks.ts`.
- `cancelCrmTaskCore` exists in `apps/web/src/actions/crm-tasks.core.ts`.
- Domain reason codes already exist: `not_needed`, `duplicate`, `created_in_error`, and
  `subject_closed`.
- `cancelCrmTask` transitions non-terminal tasks to `cancelled`, records `cancelledAt`, records
  `cancellationReasonCode`, and treats same-reason cancellation on an already-cancelled task as
  idempotent.
- The CRM task domain and CRM26 boundary already expose reopen contracts and reason codes. CRM31
  does not need to build recovery persistence; it defers any reopen UI, terminal-task surfacing, or
  recovery workflow design.
- CRM26 audit metadata sets `operation` to the same value as the task mutation event, so
  cancellation audit metadata should carry `operation: "cancelled"`.
- `CrmTaskWorkQueueItem` already carries status and lifecycle-version material needed for
  expected-version submission.
- The existing queue derivation keeps only visible, assigned, open, lead-backed tasks.

## Decision

Propose exactly one next implementation slice:

`P40-CRM31 Agent CRM Task Queue Cancellation Controls`

The proposed slice adds bounded cancellation controls to the existing `/agent/crm` task queue for
visible, assigned, open, lead-backed CRM tasks only. It reuses the CRM26 task server-action boundary
and the CRM28/CRM29/CRM30 queue DTO lifecycle-version field. It does not introduce task creation,
assignment, reopening, bulk actions, scheduler behavior, reminders, notifications, or cross-role
task UI.

## Candidate Ranking

| Rank | Candidate                                                   | Decision | Rationale                                                                                                                                         |
| ---- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM31 Agent CRM Task Queue Cancellation Controls`      | Propose  | CRM30 lets agents reschedule visible work; the next smallest useful operation is closing work that should not be completed or rescheduled.        |
| 2    | Agent task reopen controls                                  | Defer    | Reopen requires surfacing terminal tasks or a detail/history recovery surface, which is broader than the current open queue.                     |
| 3    | Assignment/reassignment controls                            | Defer    | Reassignment needs actor-picker sourcing, branch/role visibility, assignment no-op copy, and stronger audit review.                              |
| 4    | Queue filters, pagination, or broad task-list management    | Defer    | The current queue is intentionally a 10-row active work surface; list management needs separate product ranking and empty/loading/error design.   |
| 5    | Scheduler/reminders/notifications                           | Defer    | Fanout requires cron, notification, retry, rate-limit, consent, and observability design.                                                         |
| 6    | Templates/sequences/scoring                                 | Defer    | Automation and templated task content need separate PII, localization, lifecycle, and product contracts.                                         |
| 7    | Assistance intent execution into CRM tasks                  | Reject   | Assistance workflow intents remain advisory and `executionAllowed: false`; no assistance-to-CRM side effect is authorized.                       |

## Proposed CRM31 Scope

Authorized implementation scope for CRM31:

- Add cancellation controls to rows in the existing `/agent/crm` task queue.
- Show controls only for queue rows already returned by the CRM28 server-side queue read path and
  still rendered by the CRM29/CRM30 task queue controls.
- Allow cancellation only for `pending` and `in_progress` CRM task queue rows.
- Require an explicit selection from the CRM31 UI-exposed cancellation reason codes:
  - `not_needed`;
  - `duplicate`;
  - `created_in_error`.
- Keep `subject_closed` deferred from the CRM31 picker until a later gate pins lead-closure
  semantics or adds a queue DTO field that can justify the subject-closed choice without agent
  guesswork.
- Use existing CRM26 server action `cancelCrmTaskAction`.
- Submit only `taskId`, expected `lifecycleVersion`, and stable cancellation reason-code material.
- Keep CRM31 non-optimistic: controls enter a disabled pending state until the server result
  returns.
- On success, rely on existing CRM26 locale-loop CRM revalidation and route refresh behavior.
- On stale lifecycle-version conflict, render a generic row-level conflict state that asks the user
  to refresh/retry without revealing hidden task existence.
- Keep existing Start/Complete controls, due-date controls, lead link behavior, queue count, and
  task queue markers stable.
- Add focused tests for cancel action wiring, reason-code validation, stale lifecycle-version
  behavior, terminal-state behavior, rate-limit and authorization result mapping, queue-row control
  visibility, no raw PII in labels/errors, focus behavior, and the targeted agent CRM follow-up E2E
  gate behavior.

Expected implementation delta should stay focused on:

- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`;
- a narrow route-local `task-queue-cancel-controls.tsx` if extracting avoids growing the existing
  controls file too much;
- existing route-local task queue action/control tests;
- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` and page tests only if needed for wiring
  labels or preserving markers;
- existing active agent CRM message files;
- targeted preservation or update of `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.

CRM31 should avoid changing `packages/domain-crm/src/tasks/*`, `apps/web/src/actions/crm-tasks*`,
or database adapters unless implementation proves a small bug fix is required. The cancellation
state machine, reason-code taxonomy, audit behavior, rate-limit behavior, and revalidation behavior
already exist.

## Cancellation Control Contract

Controls must be derived from task status and visibility:

- `pending`: may show cancellation.
- `in_progress`: may show cancellation.
- `completed` and `cancelled`: must not appear in the queue, and must not render cancellation
  controls.
- unsupported subject kinds: must not appear in the queue, and must not render cancellation
  controls.

Cancellation controls render only when the row exists in the CRM28 queue DTO and `status` is
`pending` or `in_progress`. The UI must not consult role, branch, actor, tenant, assignment, or
subject-visibility identity to decide whether to show these controls.

The client must not derive authorization. The client may render controls based on server-provided
queue DTO status, but the submitted mutation must still pass through the CRM26 boundary, which
re-resolves session-derived tenant, actor, role, branch, assignment, subject visibility, and
lifecycle-version checks before writing.

CRM31 must not add new public task reason codes. The first UI slice should expose only:

- `not_needed` when the work item is no longer needed;
- `duplicate` when the work item duplicates another task, not when the linked lead is believed to
  be a duplicate lead;
- `created_in_error` when the task should not have been created.

The domain-level `subject_closed` reason remains available through the existing CRM26 boundary, but
CRM31 must not expose it in the agent queue picker. Using `subject_closed` correctly requires
lead-subject closure semantics or a trusted `subjectStatus` queue DTO signal; neither is promoted in
this slice.

CRM31 should not add free-text reason fields, note fields, comments, task titles, descriptions, or
localized reason strings to the domain boundary. Localized UI labels may explain existing stable
reason codes, but they must not be submitted as reason material.

Cancellation is not deletion. It updates task lifecycle metadata only and must not remove task
history, legacy `crm_activities`, or audit/history evidence.

CRM31 controls must render only on CRM28 task-backed queue rows. They must not render on legacy
due-follow-up entries, `crm_activities` compatibility rows, or any union read model used by the
existing due-follow-up surface.

## Confirmation And Interaction Contract

Cancellation is terminal in the current open queue, so the UI must require deliberate confirmation.

CRM31 must use a compact row-local inline confirmation surface. Do not introduce a modal,
page-level dialog, or global alert surface for this first queue affordance. The confirmation surface
must use the existing row-local action grouping pattern with a named `role="group"` region and the
existing row-local `aria-live="polite"` message region for pending and error copy. The confirmation
surface must:

- name the action as cancelling the task, not deleting it;
- require selecting one UI-exposed reason code before Save/Confirm is enabled;
- offer a Cancel/Dismiss control that returns focus to the row-local cancel affordance;
- disable Start, Complete, Due-Date, and Cancel controls for the same row while cancellation is
  pending;
- avoid disabling unrelated queue rows;
- announce pending, success, conflict, rate-limit, unavailable, and transient states through the
  existing row-local live region pattern;
- keep labels concise enough for dense desktop and mobile layouts.

On successful cancellation, the row is expected to disappear after refresh because the queue is
open-task only. Focus should move to the next remaining queue row, the previous row if no next row
exists, or the task queue heading if the queue is empty.

If one browser tab starts, completes, changes due date, or cancels a task while another tab has a
cancel confirmation open for the same row, the lifecycle-version bump invalidates the stale cancel
submission. CRM31 must map that to the generic conflict bucket.

## Idempotency Contract

CRM31 must not accept caller-authored idempotency keys for cancellation controls.

The existing CRM26 cancellation path is lifecycle-version guarded and same-reason idempotent for an
already-cancelled task. CRM31 should rely on duplicate-click suppression plus expected
lifecycle-version compare-and-set behavior rather than inventing UI-supplied keys.

A second click or parallel-tab retry after successful cancellation is expected to resolve as an
idempotent replay where CRM26 supports it or a generic lifecycle conflict where the stale expected
version no longer matches. The UI must not expose whether the task became cancelled, completed,
hidden, or otherwise invisible after the user's page loaded.

Same-reason idempotency is intentionally narrow. If a task is already cancelled with the same reason
code, the domain helper may return an idempotent success. If the task is already cancelled with a
different reason code, the domain helper must not rewrite cancellation history; CRM31 should map the
result to the generic conflict bucket rather than offering an in-place reason correction.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM31:

- Existing `/agent/crm` page and route-local component flow.
- Existing CRM26 `cancelCrmTaskAction`.
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
- CRM31 must not widen the existing CRM28 queue membership rule: cancellation controls render only
  for task rows returned to the current actor's assigned, open, lead-backed queue.
- The implementation must verify that the CRM26 action path still rejects tasks outside that queue
  through trusted repository/domain checks, or stop and promote a separate CRM26 hardening slice
  before adding the UI affordance.
- Staff/admin/member task controls are not introduced by CRM31.
- Invisible, absent, cross-tenant, cross-branch, unassigned, subject-invisible, terminal, or
  unsupported-subject tasks must all fail closed through existing CRM26 result envelopes.
- User-facing error copy must not distinguish absent tasks from invisible tasks.
- Rate-limited, stale-conflict, invalid-reason, terminal-state, and transient repository failure
  states may have distinct generic copy when they do not expose hidden task existence or task
  counts.

## Domain Coupling Boundary

- CRM31 should reuse existing `@interdomestik/domain-crm/tasks` cancellation helpers through the
  CRM26 server-action boundary.
- Route-local UI must not import database modules or mutate CRM task rows directly.
- Route-local UI may import only the public server actions or a narrow route-local action wrapper.
- `packages/domain-crm/src/tasks/*` must not import app code, database code, route code,
  localization, or rendering concerns.
- CRM31 must not create a parallel task lifecycle service outside the existing CRM26 boundary.
- CRM31 must not reintroduce legacy `crm_activities` writes or make cancellation depend on legacy
  activity rows except through already-existing CRM27 compatibility behavior.
- UI components under `apps/web/src/components/**` or route-local component files must not import
  `packages/domain-crm/src/tasks/*` directly for cancellation decisions. They receive the CRM28
  queue DTO and call the CRM26 boundary or a route-local wrapper only.

## PII And Privacy Boundary

Cancellation controls and result copy are operational metadata, not a place for raw customer or
case content.

Allowed UI/action material:

- stable localized labels for opening, confirming, dismissing, and submitting cancellation;
- stable localized labels for UI-exposed cancellation reason codes;
- task status, priority, due bucket, due date, and existing stable reason-code labels;
- task id and lifecycle version submitted to the existing action boundary;
- generic success, conflict, rate-limit, unavailable, invalid-reason, and retry copy.

Blocked UI/action material:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw user-authored task titles or descriptions;
- free-text cancellation reasons;
- UI copy that implies `duplicate` means the linked lead is a duplicate. CRM31 duplicate copy must
  say duplicate task work only;
- PII in action payload keys, idempotency keys, route params beyond existing lead id usage, audit
  metadata, logs, telemetry names, test snapshots, or error messages.

No AI behavior is introduced. CRM31 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## UI And Accessibility Contract

CRM31 is a bounded queue affordance, not a redesign.

- The existing `/agent/crm` route, layout, `agent-crm-page-ready` marker, and
  `agent-crm-task-queue-ready` marker must remain.
- Cancellation controls should live inside existing queue rows and preserve the existing lead link,
  Start/Complete controls, and due-date controls.
- The cancel affordance must be keyboard reachable and screen-reader distinguishable by task row
  context.
- Confirmation must require a reason selection before the submit control is enabled.
- Pending submissions must prevent duplicate clicks for the same row/action.
- A pending or failed cancellation mutation on one row must not disable, overwrite, or announce
  state for adjacent rows.
- Invalid-reason, conflict, terminal-state, and rate-limit states must be announced in an
  accessible, row-local way.
- Dismissing confirmation must return focus to a stable row-local control.
- Successful cancellation should move focus to the next actionable queue row, the previous
  actionable row, or the queue heading if no queue row remains.
- Stable E2E markers may be added for the control surface, such as
  `agent-crm-task-queue-cancel`, `agent-crm-task-queue-cancel-confirm`, and
  `agent-crm-task-queue-cancel-reason`; add `agent-crm-task-queue-cancel-dismiss` if the dismiss
  control is rendered separately. Markers should not embed task ids or PII-bearing values.
- Active app locale copy must be added for `sq`, `en`, `sr`, and `mk`.
- Cancellation reason labels must be localized distinctly in each active app locale, not left as
  English fall-through. `pnpm i18n:check` and `pnpm i18n:purity:check` must stay green after the
  CRM31 message additions.
- The compact layout must remain usable on mobile and dense desktop viewports. WCAG 2.1 AA is the
  review floor.
- CRM31 should keep using the existing icon-plus-text `TaskQueueIconButton` pattern with concise
  labels, but row actions must wrap or stack in a predictable tab order on narrow viewports. Do not
  add an overflow menu in this slice unless wrapping fails accessibility or mobile layout proof.

## Audit, Rate-Limit, And Revalidation Contract

CRM31 must rely on the existing CRM26 mutation boundary for:

- `logAuditEvent` audit records with `crm.task.cancelled`;
- `enforceRateLimitForAction` mutation throttling;
- lifecycle-version compare-and-set behavior;
- locale-loop CRM revalidation.

The inherited CRM26 revalidation path set is `/{locale}/agent/crm`, `/{locale}/staff/crm`, and
`/{locale}/admin/crm` across active `LOCALES`, as defined by `CRM_TASK_REVALIDATION_PATHS` in
`apps/web/src/actions/crm-tasks.core.ts` and covered by
`apps/web/src/actions/crm-tasks.core.test.ts`. CRM31 must not add a new revalidation fanout unless
the implementation PR proves it is fixing a CRM26 bug. Existing lead-follow-up compatibility or
lead-detail behavior that revalidates `/{locale}/agent/leads/{leadId}` remains separate and must
not be silently broadened by this cancellation-control slice.

CRM31 must not add parallel audit logging, custom rate-limit bypasses, or route-local revalidation
outside the existing boundary unless the implementation PR explicitly justifies a bug fix in the
CRM26 action layer.

Inherited CRM26 audit metadata is non-PII and limited to the current CRM task mutation envelope:
`event`, `fromStatus`, `operation`, `reasonCode`, `replay`, `subjectKind`, and `toStatus`, with the
task id carried as `entityId`. CRM31 must not add route-local audit metadata containing lead labels,
task titles, previous or next due dates, free-text reasons, or user-authored content.

For cancellation, `operation` must equal the event value `cancelled`. This mirrors the CRM26
metadata builder and should be treated as a review guard against future audit metadata drift.

Idempotent replay and stale lifecycle-version behavior must preserve existing CRM26 typed result
semantics.

CRM26 rate limiting runs before repository mutation and before idempotent replay discovery. Duplicate
cancel submissions are therefore still subject to the existing action rate limit. CRM31 must not add
a rate-limit bypass for retries or same-reason idempotency.

CRM31 intentionally does not broaden lead-detail revalidation. Existing lead-detail or legacy
follow-up surfaces may remain stale until the next navigation or their already-owned revalidation
path runs. That is accepted for CRM31 to avoid silently expanding CRM26 fanout.

## Side-Effect Contract

CRM31 may only cancel existing visible CRM tasks through the CRM26 boundary.

It must not add:

- task create, assign, reopen, bulk action, drag/drop, or inline task content editing beyond the
  existing CRM29 and CRM30 controls;
- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, calendar, or outbox events;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill;
- task title/description/content persistence;
- deletion of CRM tasks, CRM task history, or legacy CRM activity rows.

## Fail-Closed Rules

CRM31 must fail closed when:

- no authenticated agent session is available;
- tenant, actor, role, or branch scope cannot be derived from trusted session context;
- the target task is absent, invisible, cross-tenant, cross-branch, unassigned, terminal,
  unsupported, or subject-invisible;
- the task subject is not `lead`;
- the submitted lifecycle version is stale;
- the submitted cancellation reason is missing or not one of the CRM31 UI-exposed cancellation
  reason codes;
- the submitted cancellation reason is `subject_closed` through the CRM31 route-local UI wrapper
  before lead-closure semantics are separately authorized;
- the mutation would require raw lead notes, follow-up free text, case narrative, medical facts,
  legal strategy, insurer correspondence, assistance summaries, document text, or AI output;
- implementation would require a new route, proxy edit, scheduler, notification, outbox, schema/RLS,
  auth, tenancy, routing, or architecture change.

Fail-closed UI for visibility and authorization denials must use a generic unavailable state and
must not distinguish absent from invisible work items.

## Result-To-Copy Mapping

CRM31 must map CRM26 results and domain denial reasons into stable, localized, non-PII UI buckets.
The UI should render bucketed copy only; it must not expose raw repository or denial reason strings.

| Copy bucket                        | Inputs mapped to the bucket                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue.cancel.error.unavailable`   | `unauthorized`, `forbidden`, `not_found`, `actor_scope`, `assignment_scope`, `branch_scope`, `role_scope`, `subject_not_found`, `subject_not_visible`, `subject_proof_missing`, `tenant_scope`, `invalid_assignment_target`, `invalid_priority`, `invalid_subject_reference`, `invalid_task_id`, `invalid_timestamp`, `non_monotonic_timestamp`                    |
| `queue.cancel.error.invalid_reason` | missing or unsupported cancellation reason, `invalid_reason_code`                                                                                                                                                                                                                                                                                                      |
| `queue.cancel.error.conflict`      | `conflict`, stale expected lifecycle version, `duplicate_idempotency_conflict`, `terminal_state`, `unsupported_transition`                                                                                                                                                                                                                                             |
| `queue.cancel.error.rate_limited`  | CRM26 action rate-limit result                                                                                                                                                                                                                                                                                                                                         |
| `queue.cancel.error.transient`     | `repository_failure` or other retryable infrastructure failure                                                                                                                                                                                                                                                                                                         |

Success copy may name the task as cancelled using stable action labels. Failure copy must not
distinguish absent work from invisible work.

## Non-Goals

- Staff/admin/member task queues or task-management surfaces.
- Task creation, assignment, reopening, bulk action, drag/drop, or inline task content editing.
- New routes, API endpoints, route groups, canonical route aliases, or proxy edits.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, calendar, or outbox emission.
- CRM templates, sequences, scoring, campaign automation, consent/preference implementation, or
  automated routing triggers.
- Historical data backfill, destructive migration, or deletion of legacy `crm_activities` rows.
- Account/contact/support-handoff/deal task subject rendering in the agent queue.
- Assistance-session intent execution, CRM lead creation from assistance, claim creation,
  support-handoff creation, Professional Recovery activation, billing, finance, agreement, POA,
  assignment, or airline/insurer/third-party submission workflows.
- Database schema, migrations, RLS, or DB-access baseline changes.
- Task titles, descriptions, raw user-authored content, labels backed by free text, or task
  templates.
- `subject_closed` picker exposure before lead-closure semantics or trusted queue DTO
  subject-status material are separately promoted.
- Tenant timezone preference, business calendar, holiday calendar, recurring schedule model, SLA
  calendar, or reminder engine.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture,
  Stripe, README, AGENTS.md, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM30` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#845` and merge commit `fbfe70c8be9a69079784f6c7f9f31fab1be105c1`.
- DG08 promotes only `P40-CRM31 Agent CRM Task Queue Cancellation Controls`.
- CRM31 adds cancellation controls only to visible queue rows on the existing `/agent/crm` route.
- Controls render only for visible, assigned, open, lead-backed CRM tasks from the CRM28 queue DTO.
- Cancellation uses existing `cancelCrmTaskAction`.
- Cancellation requires one CRM31 UI-exposed stable cancellation reason code and does not accept
  free text.
- The CRM31 UI exposes `not_needed`, `duplicate`, and `created_in_error`; it does not expose
  `subject_closed` until lead-closure semantics or trusted queue DTO subject-status material are
  separately promoted.
- The submitted action payload contains only task id, expected lifecycle version, and stable
  reason-code material.
- CRM31 is non-optimistic: controls remain pending/disabled until the server result returns, and
  stale expected-version responses render a generic conflict state.
- Cancellation controls do not accept caller-authored idempotency keys; duplicate submissions are
  handled by duplicate-click suppression plus existing lifecycle-version/idempotent-same-reason
  behavior.
- Invalid-reason, stale lifecycle-version, terminal-state, rate-limit, unauthorized, forbidden,
  not-found, and repository-failure results render generic non-PII copy without hidden-task
  disclosure.
- CRM26 results and domain denial reasons are mapped into stable locale keys rather than raw
  low-level error strings.
- CRM31 verifies that cancellation mutations cannot target tasks outside the current actor's
  visible assigned queue through the trusted CRM26 path, or stops before implementation and
  promotes a CRM26 hardening slice.
- Existing Start/Complete controls, due-date controls, lead links, due-follow-up behavior,
  lead-detail completion behavior, canonical routes, and clarity markers remain unchanged.
- Cancellation controls never appear on legacy due-follow-up or `crm_activities` compatibility
  rows.
- Active app locale labels are present for `sq`, `en`, `sr`, and `mk`.
- Active app locale labels for the three exposed cancellation reasons pass `pnpm i18n:check` and
  `pnpm i18n:purity:check` without English fall-through regressions.
- `duplicate` copy names duplicate task work only and must not imply duplicate lead identity.
- Lead-detail task or follow-up surfaces are allowed to remain stale until their next navigation or
  existing owner revalidation path; CRM31 must not broaden revalidation fanout to hide that.
- Mobile and dense desktop proof shows row action controls wrap or stack with a stable tab order and
  without horizontal scroll.
- Focused tests cover control visibility, action payloads, reason validation, reason-code mapping,
  result mapping, duplicate-click suppression, stale lifecycle conflicts, terminal-state handling,
  PII-safe copy, accessibility basics, and targeted agent CRM E2E behavior.
- No reopening, assignment, staff/admin/member task UI, new routes, scheduler, reminder,
  notification, outbox, assistance execution, database migration/RLS, proxy, auth, tenancy, Stripe,
  README, AGENTS.md, or broad architecture-doc change is included.

## Implementation Review Plan

The CRM31 implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: no caller-supplied authority, no raw PII/case content in labels, payloads,
  errors, logs, telemetry, or snapshots; absent vs. invisible copy remains indistinguishable.
- Platform/runtime: existing CRM26 action boundary is reused; lifecycle-version conflicts,
  terminal-state handling, rate-limit behavior, audit events, result-to-copy mapping, and
  revalidation semantics remain consistent.
- Domain boundary: cancellation state stays owned by `domain-crm` and CRM26; no parallel
  route-local lifecycle logic or database mutation path is introduced.
- Product/workflow: controls are useful but bounded; reopen/assign/scheduler work remains out of
  scope.
- QA/accessibility: existing gate behavior stays green, pending/disabled/conflict/invalid-reason
  states are usable, keyboard/screen-reader behavior is covered, and existing clarity markers
  remain intact.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Decisions

- High: cancellation is terminal in the current queue. CRM31 mitigates accidental loss with
  required confirmation and a bounded reason selector. Reopen persistence and action contracts
  already exist, but surfacing terminal tasks, choosing recovery copy, and exposing reopen UI still
  need a later design if recovery becomes necessary.
- High: route-local UI could accidentally trust queue DTO visibility as authorization. The server
  action must still re-authorize every mutation through CRM26, and implementation must verify that
  behavior.
- Medium: cancellation can be confused with completion. Copy must clearly describe "cancel task"
  without implying work was resolved or deleted.
- Medium: successful cancellation removes a row from the open queue after refresh. Focus handling
  must keep keyboard users oriented.
- Medium: adding a fourth row-local control family after Start, Complete, and Due Date can crowd
  mobile layout. The implementation should extract a row-local cancel component if needed and must
  verify predictable wrapping or stacking with keyboard tab order.
- Low: same-reason cancellation idempotency exists in the domain helper, but expected-version
  behavior may still return conflict after refresh. Different-reason cancellation against an
  already-cancelled task is not idempotent and should also map to conflict without hidden-state
  disclosure.

Resolved review decisions:

1. CRM31 requires a row-local inline confirmation surface for every cancellation.
2. `duplicate` reason copy means duplicate task work only, not duplicate lead identity.
3. `subject_closed` remains a domain reason code but is not exposed in the CRM31 queue picker until
   lead-closure semantics or trusted queue DTO subject-status material are separately promoted.

## Verification Proof For This Design Gate

Before opening the promotion PR, run:

- `git diff --check`;
- `pnpm plan:status`;
- `pnpm plan:audit`;
- `pnpm track:audit`;
- `pnpm docs:verify`;
- `pnpm repo:size:check` and repo-size audit if the added design/tracker/program text crosses the
  current budget.

Also run `pnpm ci:local:quick` if available in the active
environment. If the dedicated worktree cannot resolve dependencies, report the exact blocker and
run the strongest available docs/tracker fallback from a dependency-ready checkout.

## Verification Plan For CRM31 Implementation

Focused implementation proof should include:

- route-local action tests for valid cancellation, invalid input, unsupported/missing reason,
  stale lifecycle-version conflict, not-found/forbidden/unavailable mapping, rate-limit mapping,
  repository-failure mapping, and no raw low-level reason leakage;
- component tests for control visibility on `pending` and `in_progress` queue rows, no controls for
  terminal/legacy rows, required reason selection, confirmation dismiss behavior, duplicate-click
  suppression, row-local pending state, row-local conflict state, and focus after success/failure;
- page tests proving Start/Complete controls, due-date controls, lead links, queue count, and
  `agent-crm-task-queue-ready` remain stable;
- existing `apps/web/src/actions/crm-tasks.core.test.ts` cancellation coverage, extended only if a
  CRM26 bug is discovered;
- `pnpm --filter @interdomestik/domain-crm test:unit` to keep existing cancellation and reopen
  domain contracts green;
- active locale completeness and purity checks for `sq`, `en`, `sr`, and `mk` through
  `pnpm i18n:check` and `pnpm i18n:purity:check`;
- targeted Playwright proof for existing agent CRM follow-up behavior and the queue controls on
  supported locales, preserving canonical `/agent/crm` markers;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

The implementation PR must also run the Interdomestik implementation reviewer pool and a
diff-scoped security scan before required gates.

## Program/Tracker Promotion State

This promotion records the following repo-canonical state:

- This DG08 record is `complete`.
- `P40-CRM30` is complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md` using the predecessor proof above.
- Exactly one next implementation slice is promoted:
  `P40-CRM31 Agent CRM Task Queue Cancellation Controls`.
- Changes stay scoped to docs/plans, tracker/program proof, and repo-size budget.
- Do not edit runtime code, tests, proxy, routes, auth, tenancy, schemas, migrations, Stripe,
  README, AGENTS.md, or architecture docs during the DG08 promotion.

## Completion State

| Item                                                          | Status       | Evidence                                                            |
| ------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls` | merged       | PR `#845`, merge commit `fbfe70c8be9a69079784f6c7f9f31fab1be105c1`. |
| `P40-DG08 CRM Task Queue Cancellation Controls Design Gate`   | complete     | This document; promoted after review hardening.                     |
| `P40-CRM31 Agent CRM Task Queue Cancellation Controls`        | promoted     | Sole next implementation slice authorized by this gate.             |

## Final Decision For Review

This gate promotes exactly one implementation slice:

`P40-CRM31 Agent CRM Task Queue Cancellation Controls`

Implementation is authorized only within the scope and exclusions defined above.
