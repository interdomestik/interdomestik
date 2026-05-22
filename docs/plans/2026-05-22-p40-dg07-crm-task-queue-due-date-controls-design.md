# P40-DG07 CRM Task Queue Due-Date Adjustment Controls Design Gate

Status: complete
Slice: `P40-DG07`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-22
Authority: repo-canonical completed design gate. This gate promotes the next bounded
implementation slice after `P40-CRM29 Agent CRM Task Queue Start And Complete Controls`.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                                                                |
| -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-22 | Initial review draft after `P40-CRM29` agent queue Start/Complete controls merged through PR #841.                                                   |
| `r2`     | 2026-05-22 | Design-review hardening for timezone normalization, date-boundary policy, authorization posture, result buckets, audit metadata, and focus behavior. |
| `r3`     | 2026-05-22 | Promoted DG07 to complete and authorized `P40-CRM30` as the next bounded implementation slice.                                                       |

## Definitions

- Due-date adjustment controls: bounded UI controls that let an authorized actor adjust the `dueAt`
  value of a visible CRM task through the existing CRM26 `updateCrmTaskDueAtAction` path.
- Due date: the task-level ISO timestamp stored as `CrmTask.dueAt`; it is operational scheduling
  metadata, not a task title, description, reminder, notification, or appointment engine.
- Clear due-date operation: setting `dueAt` to `null` through the existing `due_date_cleared`
  reason code.
- Change due-date operation: setting `dueAt` to a valid ISO timestamp through the existing
  `due_date_changed` reason code.
- Lifecycle version: the optimistic concurrency token already exposed by CRM task rows and the
  CRM28 queue DTO.
- CRM26 boundary: the existing CRM task application-service/server-action boundary in
  `apps/web/src/actions/crm-tasks.core.ts` and `apps/web/src/actions/crm-tasks.ts`.
- Runtime task management: broad CRUD, assignment, cancellation, reopening, cross-role queues,
  staff/admin management, scheduler, reminders, notifications, templates, sequences, scoring, or
  automation. This is not promoted here.
- Assistance intent execution: turning `domain-assistance` workflow intents into CRM side effects.
  This remains blocked; P39 intent output is advisory and uses `executionAllowed: false`.

## Predecessor Dependency

`P40-CRM29 Agent CRM Task Queue Start And Complete Controls` is the direct predecessor.

Predecessor proof:

- `P40-DG06 CRM Task Queue Lifecycle Controls Design Gate` is recorded in
  `docs/plans/2026-05-22-p40-dg06-crm-task-queue-lifecycle-controls-design.md`.
- `P40-CRM29` merged as PR `#841`, merge commit
  `9dc0a300a89b4501a99879271dac7839d1ab533c`, on 2026-05-22.
- PR `#841` added route-local Start and Complete controls to the existing `/agent/crm` CRM28 task
  queue for visible, assigned, open, lead-backed task rows only.
- PR `#841` reused CRM26 `startCrmTaskAction` and `completeCrmTaskAction`, pinned
  `manual_start` and `resolved` reason codes, preserved server-side reauthorization, exposed only
  UI-safe result buckets, kept row-local pending/failure states, and left legacy due-follow-up rows
  separate.
- Local proof for PR `#841` passed focused route-local action/control/page unit tests, web
  type-check, i18n completeness and purity checks, targeted agent CRM follow-up Playwright proof,
  `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate` with 128 passed / 4 skipped.
- Notion closeout is recorded at `https://www.notion.so/368036cff1f881b88e57c7679ff4e84f`.

This gate must not reinterpret the task queue as broad task management. CRM30 may only add bounded
due-date adjustment to already-visible agent queue rows.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior P40 gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`,
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`,
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`,
  `docs/plans/2026-05-21-p40-dg05-crm-task-work-queue-ui-foundation-design.md`, and
  `docs/plans/2026-05-22-p40-dg06-crm-task-queue-lifecycle-controls-design.md`.
- CRM task domain contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, `packages/domain-crm/src/tasks/work-queue.ts`,
  and `packages/domain-crm/src/tasks/index.ts`.
- CRM task runtime boundary: `apps/web/src/actions/crm-tasks.core.ts`,
  `apps/web/src/actions/crm-tasks.ts`, and `apps/web/src/actions/crm-tasks.core.test.ts`.
- CRM task queue UI: `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`, and matching tests.
- Existing migrated follow-up E2E proof: `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling active app
  locale files for `sq`, `sr`, and `mk`.

Codebase verification as of this draft:

- `updateCrmTaskDueAtAction` exists in `apps/web/src/actions/crm-tasks.ts`.
- `updateCrmTaskDueAtCore` exists in `apps/web/src/actions/crm-tasks.core.ts`.
- Domain reason codes already exist: `due_date_changed` and `due_date_cleared`.
- `CrmTaskWorkQueueItem` already carries `dueAt`, `dueBucket`, and `lifecycleVersion`.
- The existing queue derivation keeps only visible, assigned, open, lead-backed tasks.

## Decision

Propose exactly one next implementation slice:

`P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls`

The proposed slice adds bounded due-date adjustment controls to the existing `/agent/crm` task queue
for visible, assigned, open, lead-backed CRM tasks only. It reuses the CRM26 task server-action
boundary and the CRM28/CRM29 queue DTO lifecycle-version field. It does not introduce task creation,
assignment, cancellation, reopening, bulk actions, scheduler behavior, reminders, notifications,
or cross-role task UI.

## Candidate Ranking

| Rank | Candidate                                                     | Decision | Rationale                                                                                                                                 |
| ---- | ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls` | Propose  | CRM29 lets agents progress visible work; the next smallest useful operation is rescheduling visible work without terminal-state recovery. |
| 2    | Agent task cancellation controls                              | Defer    | Cancellation is terminal and needs confirmation, recovery, audit-copy, and accidental-loss posture.                                       |
| 3    | Agent task reopen controls                                    | Defer    | Reopen requires surfacing terminal tasks or a detail/history recovery surface, which is broader than the current queue.                   |
| 4    | Assignment/reassignment controls                              | Defer    | Reassignment needs actor-picker sourcing, branch/role visibility, assignment no-op copy, and stronger audit review.                       |
| 5    | Scheduler/reminders/notifications                             | Defer    | Fanout requires cron, notification, retry, rate-limit, and observability design.                                                          |
| 6    | Templates/sequences/scoring                                   | Defer    | Automation and templated task content need separate PII, localization, lifecycle, and product contracts.                                  |
| 7    | Assistance intent execution into CRM tasks                    | Reject   | Assistance workflow intents remain advisory and `executionAllowed: false`; no assistance-to-CRM side effect is authorized.                |

## Proposed CRM30 Scope

Authorized implementation scope for CRM30:

- Add due-date adjustment controls to rows in the existing `/agent/crm` task queue.
- Show controls only for queue rows already returned by the CRM28 server-side queue read path.
- Allow due-date changes only for `pending` and `in_progress` CRM task queue rows.
- Use existing CRM26 server action `updateCrmTaskDueAtAction`.
- Submit only `taskId`, expected `lifecycleVersion`, selected due-date operation, and stable
  due-date value material.
- Use existing reason codes:
  - `due_date_changed` when `dueAt` is set to a valid ISO timestamp;
  - `due_date_cleared` when `dueAt` is set to `null`.
- Keep CRM30 non-optimistic: controls enter a disabled pending state until the server result
  returns.
- On success, rely on existing CRM26 locale-loop CRM revalidation and refresh behavior.
- On stale lifecycle-version conflict, render a generic row-level conflict state that asks the user
  to refresh/retry without revealing hidden task existence.
- Keep existing Start/Complete controls, lead link behavior, queue count, and task queue markers
  stable.
- Add focused tests for due-date action wiring, input validation, reason-code mapping,
  stale lifecycle-version behavior, rate-limit and authorization result mapping, queue-row control
  visibility, no raw PII in labels/errors, and the targeted agent CRM follow-up E2E gate behavior.

Expected implementation delta should stay focused on:

- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-controls.tsx`;
- existing route-local task queue action/control tests;
- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx` and page tests only for wiring labels;
- existing active agent CRM message files;
- targeted preservation or update of `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.

CRM30 should avoid changing `packages/domain-crm/src/tasks/*`, `apps/web/src/actions/crm-tasks*`,
or database adapters unless implementation proves a small bug fix is required. The due-date state
machine, reason-code taxonomy, audit behavior, rate-limit behavior, and revalidation behavior
already exist.

## Due-Date Control Contract

Controls must be derived from task status and visibility:

- `pending`: may show due-date adjustment.
- `in_progress`: may show due-date adjustment.
- `completed` and `cancelled`: must not appear in the queue, and must not render due-date controls.
- unsupported subject kinds: must not appear in the queue, and must not render due-date controls.

Due-date controls render only when the row exists in the CRM28 queue DTO and `status` is `pending`
or `in_progress`. The UI must not consult role, branch, actor, tenant, assignment, or
subject-visibility identity to decide whether to show these controls.

The client must not derive authorization. The client may render controls based on server-provided
queue DTO status, but the submitted mutation must still pass through the CRM26 boundary, which
re-resolves session-derived tenant, actor, role, branch, assignment, subject visibility, and
lifecycle-version checks before writing.

CRM30 must not add new public task reason codes. It should reuse:

- `due_date_changed` for a valid new due date;
- `due_date_cleared` for clearing the due date.

CRM30 should not add free-text reason fields, note fields, comments, task titles, descriptions, or
localized reason strings to the domain boundary.

Due-date adjustment is not a reminder system. It updates task scheduling metadata only; it must not
emit notification, reminder, outbox, email, SMS, WhatsApp, push, calendar, analytics, or scheduler
side effects.

CRM30 controls must render only on CRM28 task-backed queue rows. They must not render on legacy
due-follow-up entries, `crm_activities` compatibility rows, or any union read model used by the
existing due-follow-up surface.

## Input And Timezone Contract

CRM30 should prefer a native, compact date/time control such as `input[type="datetime-local"]`
before introducing a custom date picker. A custom widget is allowed only if it preserves keyboard,
screen-reader, and mobile behavior at least as well as the native control.

The submitted value must be normalized before calling the CRM26 boundary:

- `dueAt` must be either `null` or a valid ISO timestamp.
- Empty input maps to `null` and `due_date_cleared`.
- Non-empty input maps to `due_date_changed` after local wall-clock input is converted to a `Date`
  and submitted as `toISOString()` UTC.
- Invalid date/time input must fail before the CRM26 call with generic, localized validation copy.
- CRM30 does not add an extra UI date-range floor or cap. Past due dates and far-future due dates
  are accepted when they normalize to valid ISO timestamps and the existing CRM26/domain helper
  accepts them. Any future floor/cap such as "today" or "+1 year" is a separate product policy
  change and must not be introduced silently in CRM30.

The implementation must not introduce a tenant timezone preference, business-calendar engine,
holiday calendar, SLA calendar, or recurring schedule model. Existing display formatting may keep
using the current locale-aware `Intl.DateTimeFormat` behavior on the page.

Tests must avoid depending on the developer machine timezone. Focused tests should use fixed ISO
timestamps and deterministic `now` values where possible.

## Idempotency Contract

CRM30 must not accept caller-authored idempotency keys for due-date controls.

The existing CRM26 update path is lifecycle-version guarded and idempotent when the submitted
`dueAt` equals the current task value; `updateCrmTaskDueAt` returns an idempotent success with no
transition in that case. CRM30 should rely on duplicate-click suppression plus expected
lifecycle-version compare-and-set behavior rather than inventing UI-supplied keys.

A second click or parallel-tab retry after a successful due-date update is expected to resolve as an
idempotent replay where CRM26 supports it or a generic lifecycle conflict where the stale expected
version no longer matches.

If one browser tab starts/completes a task while another tab has an open due-date edit for the same
row, the lifecycle-version bump invalidates the stale due-date submission. CRM30 must map that to
the same generic conflict bucket.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM30:

- Existing `/agent/crm` page and route-local component flow.
- Existing CRM26 `updateCrmTaskDueAtAction`.
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
- CRM30 must not widen the existing CRM28 queue membership rule: due-date controls render only for
  task rows returned to the current actor's assigned, open, lead-backed queue. The implementation
  must verify that the CRM26 action path still rejects tasks outside that queue through trusted
  repository/domain checks, or stop and promote a separate CRM26 hardening slice before adding the
  UI affordance.
- Staff/admin/member task controls are not introduced by CRM30.
- Invisible, absent, cross-tenant, cross-branch, unassigned, subject-invisible, terminal, or
  unsupported-subject tasks must all fail closed through existing CRM26 result envelopes.
- User-facing error copy must not distinguish absent tasks from invisible tasks.
- Rate-limited, stale-conflict, invalid-date, and transient repository failure states may have
  distinct generic copy when they do not expose hidden task existence or task counts.

## Domain Coupling Boundary

- CRM30 should reuse existing `@interdomestik/domain-crm/tasks` due-date helpers through the CRM26
  server-action boundary.
- Route-local UI must not import database modules or mutate CRM task rows directly.
- Route-local UI may import only the public server actions or a narrow route-local action wrapper.
- `packages/domain-crm/src/tasks/*` must not import app code, database code, route code,
  localization, or rendering concerns.
- CRM30 must not create a parallel task lifecycle service outside the existing CRM26 boundary.
- CRM30 must not reintroduce legacy `crm_activities` writes or make due-date updates depend on
  legacy activity rows except through already-existing CRM27 compatibility behavior.
- UI components under `apps/web/src/components/**` or route-local component files must not import
  `packages/domain-crm/src/tasks/*` directly for due-date decisions. They receive the CRM28 queue
  DTO and call the CRM26 boundary or a route-local wrapper only.

## PII And Privacy Boundary

Due-date controls and result copy are operational metadata, not a place for raw customer or case
content.

Allowed UI/action material:

- stable localized labels for editing, saving, clearing, and cancelling a due-date edit;
- task status, priority, due bucket, due date, and existing stable reason-code labels;
- task id and lifecycle version submitted to the existing action boundary;
- a valid ISO timestamp or `null`;
- generic success, invalid-date, conflict, rate-limit, unauthorized/unavailable, and retry copy.

Blocked UI/action material:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw user-authored task titles or descriptions;
- free-text reschedule reasons;
- PII in action payload keys, idempotency keys, route params beyond existing lead id usage, audit
  metadata, logs, telemetry names, test snapshots, or error messages.

No AI behavior is introduced. CRM30 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## UI And Accessibility Contract

CRM30 is a bounded queue affordance, not a redesign.

- The existing `/agent/crm` route, layout, `agent-crm-page-ready` marker, and
  `agent-crm-task-queue-ready` marker must remain.
- Due-date controls should live inside existing queue rows and preserve the existing lead link and
  Start/Complete controls.
- The edit affordance must be keyboard reachable and screen-reader distinguishable by task row
  context.
- Pending submissions must prevent duplicate clicks for the same row/action.
- A pending or failed due-date mutation on one row must not disable, overwrite, or announce state
  for adjacent rows.
- Invalid-date, conflict, and rate-limit states must be announced in an accessible, row-local way.
- Closing or saving an inline edit must return focus to a stable row-local control.
- Setting a date into the past may move the row into the overdue bucket after refresh; clearing a
  due date may move the row into the undated bucket after refresh. In either case, focus should move
  to the same row if still present, the next remaining queue row, or the queue heading if the row is
  no longer present.
- Stable E2E markers may be added for the control surface, such as
  `agent-crm-task-queue-due-edit`, `agent-crm-task-queue-due-save`, and
  `agent-crm-task-queue-due-clear`; markers should not embed task ids or PII-bearing values.
- Active app locale copy must be added for `sq`, `en`, `sr`, and `mk`.
- The compact layout must remain usable on mobile and dense desktop viewports. WCAG 2.1 AA is the
  review floor.

## Audit, Rate-Limit, And Revalidation Contract

CRM30 must rely on the existing CRM26 mutation boundary for:

- `logAuditEvent` audit records with `crm.task.due_updated`;
- `enforceRateLimitForAction` mutation throttling;
- lifecycle-version compare-and-set behavior;
- locale-loop CRM revalidation.

The inherited CRM26 revalidation path set is `/{locale}/agent/crm`, `/{locale}/staff/crm`, and
`/{locale}/admin/crm` across active `LOCALES`, as defined by `CRM_TASK_REVALIDATION_PATHS` in
`apps/web/src/actions/crm-tasks.core.ts` and covered by
`apps/web/src/actions/crm-tasks.core.test.ts`. CRM30 must not add a new revalidation fanout unless
the implementation PR proves it is fixing a CRM26 bug. Existing lead-follow-up compatibility or
lead-detail behavior that revalidates `/{locale}/agent/leads/{leadId}` remains separate and must
not be silently broadened by this due-date-control slice.

CRM30 must not add parallel audit logging, custom rate-limit bypasses, or route-local revalidation
outside the existing boundary unless the implementation PR explicitly justifies a bug fix in the
CRM26 action layer.

Inherited CRM26 audit metadata is non-PII and limited to the current CRM task mutation envelope:
`event`, `fromStatus`, `operation`, `reasonCode`, `replay`, `subjectKind`, and `toStatus`, with the
task id carried as `entityId`. CRM30 must not add route-local audit metadata containing previous or
next due-date values, free-text reasons, lead labels, task titles, or user-authored content.

Idempotent replay and stale lifecycle-version behavior must preserve existing CRM26 typed result
semantics.

## Side-Effect Contract

CRM30 may only update `dueAt` on existing visible CRM tasks through the CRM26 boundary.

It must not add:

- task create, assign, cancel, reopen, start, complete, bulk action, drag/drop, or inline task
  content editing beyond the existing CRM29 controls;
- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, calendar, or outbox events;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill;
- task title/description/content persistence.

## Fail-Closed Rules

CRM30 must fail closed when:

- no authenticated agent session is available;
- tenant, actor, role, or branch scope cannot be derived from trusted session context;
- the target task is absent, invisible, cross-tenant, cross-branch, unassigned, terminal,
  unsupported, or subject-invisible;
- the task subject is not `lead`;
- the submitted lifecycle version is stale;
- the submitted due-date operation is not a valid change or clear operation;
- non-null `dueAt` is not a valid ISO timestamp;
- `dueAt` validation would require tenant timezone, business-calendar, recurring-schedule, SLA, or
  reminder semantics;
- the mutation would require raw lead notes, follow-up free text, case narrative, medical facts,
  legal strategy, insurer correspondence, assistance summaries, document text, or AI output;
- implementation would require a new route, proxy edit, scheduler, notification, outbox, schema/RLS,
  auth, tenancy, routing, or architecture change.

Fail-closed UI for visibility and authorization denials must use a generic unavailable state and
must not distinguish absent from invisible work items.

## Result-To-Copy Mapping

CRM30 must map CRM26 results and domain denial reasons into stable, localized, non-PII UI buckets.
The UI should render bucketed copy only; it must not expose raw repository or denial reason strings.

The existing domain helper uses `invalid_due_at` for invalid submitted due-date values and
`invalid_timestamp` for invalid internal mutation timestamps; CRM30 must keep those meanings
separate when mapping copy.

| Copy bucket                    | Inputs mapped to the bucket                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue.due.error.unavailable`  | `unauthorized`, `forbidden`, `not_found`, `actor_scope`, `assignment_scope`, `branch_scope`, `role_scope`, `subject_not_found`, `subject_not_visible`, `subject_proof_missing`, `tenant_scope`, `invalid_assignment_target`, `invalid_priority`, `invalid_reason_code`, `invalid_subject_reference`, `invalid_task_id`, `invalid_timestamp`, `non_monotonic_timestamp` |
| `queue.due.error.invalid_date` | client-side invalid date/time input, `invalid_due_at`                                                                                                                                                                                                                                                                                                                  |
| `queue.due.error.conflict`     | `conflict`, stale expected lifecycle version, `duplicate_idempotency_conflict`, `terminal_state`, `unsupported_transition`                                                                                                                                                                                                                                             |
| `queue.due.error.rate_limited` | CRM26 action rate-limit result                                                                                                                                                                                                                                                                                                                                         |
| `queue.due.error.transient`    | `repository_failure` or other retryable infrastructure failure                                                                                                                                                                                                                                                                                                         |

Success copy may distinguish changed due date from cleared due date using stable action labels.
Failure copy must not distinguish absent work from invisible work.

## Non-Goals

- Staff/admin/member task queues or task-management surfaces.
- Task creation, assignment, cancellation, reopening, bulk action, drag/drop, or inline task
  content editing.
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
- Tenant timezone preference, business calendar, holiday calendar, recurring schedule model, SLA
  calendar, or reminder engine.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture,
  Stripe, README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM29` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#841` and merge commit `9dc0a300a89b4501a99879271dac7839d1ab533c`.
- DG07 promotes only `P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls`.
- CRM30 adds due-date controls only to visible queue rows on the existing `/agent/crm` route.
- Controls render only for visible, assigned, open, lead-backed CRM tasks from the CRM28 queue DTO.
- Due-date update uses existing `updateCrmTaskDueAtAction`.
- Non-null due dates use existing `due_date_changed`.
- Cleared due dates use existing `due_date_cleared`.
- The submitted action payload contains only task id, expected lifecycle version, due-date value or
  clear intent, and stable reason-code material.
- Non-empty date/time picker input is converted from local wall-clock input to a UTC ISO timestamp
  before submission.
- CRM30 does not add a UI date-range floor or cap; valid ISO past/future due dates remain governed
  by the existing CRM26/domain helper.
- CRM30 is non-optimistic: controls remain pending/disabled until the server result returns, and
  stale expected-version responses render a generic conflict state.
- Due-date controls do not accept caller-authored idempotency keys; duplicate submissions are
  handled by duplicate-click suppression plus existing lifecycle-version/idempotent-same-value
  behavior.
- Invalid-date, stale lifecycle-version, rate-limit, unauthorized, forbidden, not-found, and
  repository-failure results render generic non-PII copy without hidden-task disclosure.
- CRM26 results and domain denial reasons are mapped into stable locale keys rather than raw
  low-level error strings.
- CRM30 verifies that due-date mutations cannot target tasks outside the current actor's visible
  assigned queue through the trusted CRM26 path, or stops before implementation and promotes a
  CRM26 hardening slice.
- Existing Start/Complete controls, lead links, due-follow-up behavior, lead-detail completion
  behavior, canonical routes, and clarity markers remain unchanged.
- Due-date controls never appear on legacy due-follow-up or `crm_activities` compatibility rows.
- Active app locale labels are present for `sq`, `en`, `sr`, and `mk`.
- Focused tests cover control visibility, action payloads, due-date validation, reason-code
  mapping, result mapping, duplicate-click suppression, stale lifecycle conflicts, PII-safe copy,
  accessibility basics, and targeted agent CRM E2E behavior.
- No cancellation, reopening, assignment, staff/admin/member task UI, new routes, scheduler,
  reminder, notification, outbox, assistance execution, database migration/RLS, proxy, auth,
  tenancy, Stripe, README, AGENTS, or broad architecture-doc change is included.

## Implementation Review Plan

The CRM30 implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: no caller-supplied authority, no raw PII/case content in labels, payloads,
  errors, logs, telemetry, or snapshots; absent vs. invisible copy remains indistinguishable.
- Platform/runtime: existing CRM26 action boundary is reused; lifecycle-version conflicts,
  invalid-date handling, rate-limit behavior, audit events, result-to-copy mapping, and
  revalidation semantics remain consistent.
- Domain boundary: due-date state stays owned by `domain-crm` and CRM26; no parallel route-local
  lifecycle logic or database mutation path is introduced.
- Product/workflow: controls are useful but bounded; cancel/reopen/assign/scheduler work remains
  out of scope.
- QA/accessibility: existing gate behavior stays green, pending/disabled/conflict/invalid-date
  states are usable, keyboard/screen-reader behavior is covered, and existing clarity markers remain
  intact.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: inline due-date controls can expand into full task management. CRM30 must stop at changing
  or clearing `dueAt`.
- High: route-local UI could accidentally trust queue DTO visibility as authorization. The server
  action must still re-authorize every mutation through CRM26, and implementation must verify that
  non-queue same-branch tasks cannot be mutated through the due-date path.
- High: stale lifecycle-version conflicts could produce confusing duplicate submissions. The UI
  needs deterministic pending and conflict states.
- High: date/time handling can become a hidden timezone or business-calendar project. CRM30 should
  keep ISO storage and existing locale display rather than adding tenant timezone semantics.
- High: task action copy can leak hidden task existence if not-found and forbidden are separated in
  user-facing UI. These must collapse to generic unavailable copy.
- Medium: clearing a due date can move a row into the undated bucket and change ordering after
  refresh. Setting a due date in the past can move a row into the overdue bucket. Focus behavior
  and tests must account for row movement.
- Medium: legacy due-follow-up rows and task-backed queue rows coexist on `/agent/crm`. CRM30 must
  avoid rendering due-date controls on the legacy surface.
- Medium: agents may expect reminders after rescheduling. CRM30 explicitly does not add reminders or
  notifications; copy should avoid implying fanout.

Rollback path: CRM30 should add no schema, route, proxy, cron, notification, scheduler, outbox, or
historical backfill. If behavior is wrong, rollback is a normal revert PR of due-date controls,
copy, and focused tests, leaving CRM28/CRM29 queue behavior and CRM task persistence intact.

## Approval Bar

Approve DG07 only if:

- `P40-CRM29` predecessor proof is accepted as complete.
- Only `P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls` is promoted.
- The promoted slice is agent-only, lead-backed, queue-row scoped, and rendered on the existing
  `/agent/crm` route.
- The promoted slice reuses existing CRM26 `updateCrmTaskDueAtAction`.
- Cancellation, reopening, assignment, scheduler/cron, reminders, notifications, outbox, templates,
  sequences, scoring, assistance-intent execution, database migrations/RLS, historical backfill,
  route/proxy/auth/tenancy changes, Stripe, README, AGENTS, and broad architecture-doc changes
  remain blocked.
- PII-safe action copy, server-side reauthorization, date validation, lifecycle-version conflict
  handling, duplicate-click suppression, result-to-copy buckets, legacy-row separation, focus
  management, and clarity-marker preservation are accepted as implementation requirements.

## Verification

Design-gate PR verification should include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs-only or docs/tracker/program delta

Implementation proof for `P40-CRM30` should include:

- `pnpm --filter @interdomestik/domain-crm test:unit` or an equivalent domain task test command if
  the implementation touches or relies on due-date helper behavior;
- focused UI/action tests for queue due-date control visibility and action payloads;
- focused CRM task action tests for `updateCrmTaskDueAtAction` result mapping and stale
  lifecycle-version behavior if existing coverage is insufficient;
- focused tests for invalid date/time input and clear-due-date behavior;
- focused tests for generic not-found/forbidden/unavailable copy;
- focused tests proving no raw PII/case/follow-up free text enters labels, action payloads, errors,
  logs, telemetry, or snapshots;
- focused tests proving active locale labels resolve in `sq`, `en`, `sr`, and `mk`;
- accessibility proof for keyboard control access, pending/disabled states, row-local invalid-date
  and conflict announcements, and focus after save/clear;
- targeted update or preservation proof for `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`;
- `pnpm --filter @interdomestik/web type-check`;
- `pnpm --filter @interdomestik/web test:unit`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

No DB-side verification such as migration journal or RLS-table proof is required for CRM30 because
this gate does not propose database schema, migration, RLS, or historical backfill changes.

## Completion State

The status column reflects the intended state after an approved DG07 PR merges.

| Item                                                                 | Status    | Decision                                                                           |
| -------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `P40-CRM29 Agent CRM Task Queue Start And Complete Controls`         | completed | Merged through PR `#841`, merge commit `9dc0a300a89b4501a99879271dac7839d1ab533c`. |
| `P40-DG07 CRM Task Queue Due-Date Adjustment Controls Design Gate`   | complete  | Approved after r2 hardening and promotes only `P40-CRM30`.                         |
| `P40-CRM30 Agent CRM Task Queue Due-Date Adjustment Controls`        | promoted  | Authorized agent-only queue due-date adjustment on the existing CRM page.          |
| Later P40 cancellation/reopen/assignment/scheduler/notification work | reserved  | No implementation authority from this draft.                                       |
