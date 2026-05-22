# P40-DG06 CRM Task Queue Lifecycle Controls Design Gate

Status: complete
Slice: `P40-DG06`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-22
Authority: repo-canonical approved design gate. This gate closes
`P40-CRM28 Agent CRM Task Work Queue UI Foundation` and promotes exactly one next implementation
slice.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                                                            |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `r1`     | 2026-05-22 | Initial review draft after `P40-CRM28` task work queue foundation merge.                                                                         |
| `r2`     | 2026-05-22 | Review hardening for non-optimistic action flow, idempotency, result-copy buckets, revalidation paths, legacy coexistence, and focus management. |
| `r3`     | 2026-05-22 | Approved promotion of `P40-CRM29 Agent CRM Task Queue Start And Complete Controls`.                                                              |

## Definitions

- CRM task queue lifecycle controls: bounded UI controls that let an authorized actor advance a
  visible task through already-existing CRM task lifecycle transitions.
- Agent queue lifecycle foundation: the first mutation layer on the existing `/agent/crm` task
  queue, limited to starting and completing assigned, open, lead-backed CRM tasks.
- Start control: an action that moves an assigned `pending` CRM task to `in_progress` through the
  existing CRM26 `startCrmTaskAction` path with reason code `manual_start`.
- Complete control: an action that moves an assigned `pending` or `in_progress` CRM task to
  `completed` through the existing CRM26 `completeCrmTaskAction` path with reason code `resolved`.
- Lifecycle version: the optimistic concurrency token already exposed by CRM task rows and the
  CRM28 queue DTO.
- CRM26 boundary: the existing CRM task application-service/server-action boundary in
  `apps/web/src/actions/crm-tasks.core.ts` and `apps/web/src/actions/crm-tasks.ts`.
- Runtime task management: broad CRUD, assignment, due-date editing, cancellation, reopening,
  cross-role queues, staff/admin management, scheduler, reminders, notifications, templates,
  sequences, scoring, or automation. This is not promoted here.
- Assistance intent execution: turning `domain-assistance` workflow intents into CRM side effects.
  This remains blocked; P39 intent output is advisory and uses `executionAllowed: false`.

## Predecessor Dependency

`P40-CRM28 Agent CRM Task Work Queue UI Foundation` is the direct predecessor.

Predecessor proof:

- `P40-DG05 CRM Task Work Queue UI Foundation Design Gate` is recorded in
  `docs/plans/2026-05-21-p40-dg05-crm-task-work-queue-ui-foundation-design.md`.
- `P40-CRM28` merged as PR `#839`, merge commit
  `f18b28b9b438b4ec6247da307d39c709544a35e4`, on 2026-05-22.
- PR `#839` added a pure `domain-crm` task work-queue projection, an app-side read adapter, and a
  read-only queue panel on the existing `/agent/crm` page with the
  `agent-crm-task-queue-ready` marker.
- PR `#839` kept the queue limited to visible, assigned, open, lead-backed CRM tasks, used
  PII-safe lead display projection, pinned deterministic 10-row ordering, added active app locale
  labels, and preserved the existing due-follow-up gate behavior.
- PR `#839` passed remote audit, unit, static, e2e, e2e-gate, pilot-gate, SonarCloud, gitleaks,
  pnpm-audit, commitlint, validation-surface, and pr-finalizer checks before merge.
- Notion closeout is recorded at `https://www.notion.so/368036cff1f881ea9cdee3c5b1a1b899`.

This gate must not reinterpret the task queue as broad task management. CRM29 may only add the
smallest useful lifecycle controls to the already-visible agent queue rows.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior P40 gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`,
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`,
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`, and
  `docs/plans/2026-05-21-p40-dg05-crm-task-work-queue-ui-foundation-design.md`.
- CRM task domain contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, `packages/domain-crm/src/tasks/work-queue.ts`,
  and `packages/domain-crm/src/tasks/index.ts`.
- CRM task runtime boundary: `apps/web/src/actions/crm-tasks.core.ts`,
  `apps/web/src/actions/crm-tasks.ts`, and `apps/web/src/actions/crm-tasks.core.test.ts`.
- CRM task persistence/read adapters: `apps/web/src/adapters/crm/task-repository.ts`,
  `apps/web/src/adapters/crm/task-repository.test.ts`,
  `apps/web/src/adapters/crm/task-work-queue-repository.ts`, and
  `apps/web/src/adapters/crm/task-work-queue-repository.test.ts`.
- Existing agent CRM page and queue: `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/_core.test.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`, and
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.test.tsx`.
- Existing migrated follow-up E2E proof: `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling active app
  locale files for `sq`, `sr`, and `mk`.

## Decision

Promote exactly one next implementation slice:

`P40-CRM29 Agent CRM Task Queue Start And Complete Controls`

The proposed slice adds start and complete controls to the existing `/agent/crm` task queue for
visible, assigned, open, lead-backed CRM tasks only. It reuses the CRM26 task server-action boundary
and the CRM28 queue DTO lifecycle-version field. It does not introduce task creation, assignment,
due-date editing, cancellation, reopening, bulk actions, scheduler behavior, notifications, or
cross-role task UI.

## Candidate Ranking

| Rank | Candidate                                                    | Decision | Rationale                                                                                                                      |
| ---- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P40-CRM29 Agent CRM Task Queue Start And Complete Controls` | Promote  | CRM28 now shows real task work; the smallest useful next step is to let agents mark visible queue work as started or resolved. |
| 2    | Agent task cancellation/reopen/due-date editing              | Defer    | These transitions affect task semantics and recovery from mistakes; they need separate reason-copy and UX contracts.           |
| 3    | Staff/admin task management surfaces                         | Defer    | Cross-role queues need explicit role visibility, assignment, escalation, and audit design after the agent path is proven.      |
| 4    | Scheduler/reminders/notifications                            | Defer    | Fanout requires cron, notification, retry, rate-limit, and observability design.                                               |
| 5    | Templates/sequences/scoring                                  | Defer    | Automation and templated task content need separate PII, localization, lifecycle, and product contracts.                       |
| 6    | Assistance intent execution into CRM tasks                   | Reject   | Assistance workflow intents remain advisory and `executionAllowed: false`; no assistance-to-CRM side effect is authorized.     |

## Proposed CRM29 Scope

Authorized implementation scope for CRM29:

- Add start and complete controls to rows in the existing `/agent/crm` task queue.
- Show controls only for queue rows already returned by the CRM28 server-side queue read path.
- Allow `start` only for `pending` tasks.
- Allow `complete` for `pending` and `in_progress` tasks.
- Use existing CRM26 server actions:
  - `startCrmTaskAction` with `reasonCode: 'manual_start'`;
  - `completeCrmTaskAction` with `reasonCode: 'resolved'`.
- Submit the current queue DTO `taskId` and `lifecycleVersion` as the expected lifecycle version.
- CRM29 is non-optimistic: controls enter a disabled pending state until the server result returns.
- On success, rely on existing CRM26 locale-loop CRM revalidation and refresh behavior.
- On stale lifecycle-version conflict, render a generic row-level conflict state that asks the user
  to refresh/retry without revealing hidden task existence.
- Keep the existing lead link behavior and task queue marker stable.
- Add focused tests for action wiring, stale lifecycle-version behavior, rate-limit and
  authorization result mapping, queue-row control visibility, no raw PII in action labels/errors,
  and the targeted agent CRM follow-up E2E gate behavior.

Expected implementation delta should stay focused on:

- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/page.test.tsx`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts` only if the queue DTO needs a small
  action affordance flag derived server-side;
- `apps/web/src/actions/crm-tasks.ts` and `apps/web/src/actions/crm-tasks.core.ts` only if a narrow
  agent-queue wrapper or result normalization is needed around existing actions;
- existing CRM task action tests;
- existing active agent CRM message files;
- `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.

CRM29 should avoid changing `packages/domain-crm/src/tasks/*` unless implementation proves a small
pure affordance helper is required. The lifecycle state machine and reason-code taxonomy already
exist.

## Lifecycle Control Contract

Controls must be derived from task status and visibility:

- `pending`: may show Start and Complete.
- `in_progress`: may show Complete.
- `completed` and `cancelled`: must not appear in the queue, and must not render controls.
- unsupported subject kinds: must not appear in the queue, and must not render controls.

Start renders only when the row exists in the CRM28 queue DTO and `status === 'pending'`. Complete
renders only when the row exists in the CRM28 queue DTO and `status` is `pending` or
`in_progress`. The UI must not consult role, branch, actor, tenant, assignment, or subject-visibility
identity to decide whether to show these controls.

The client must not derive authorization. The client may render controls based on server-provided
queue DTO status, but the submitted mutation must still pass through the CRM26 boundary, which
re-resolves session-derived tenant, actor, role, branch, assignment, subject visibility, and
lifecycle-version checks before writing.

CRM29 should not add a separate action-affordance flag to `_core.ts` unless the implementation
proves status-only rendering is insufficient. The queue DTO status is the default control authority.

The implementation must not add new public task reason codes. It should reuse:

- `manual_start` for start;
- `resolved` for complete.

If product copy later needs richer completion semantics, that belongs in a later gate.

Start and Complete are not destructive actions and must not introduce a confirmation modal or
confirmation flow. Confirmation patterns are reserved for later cancellation, reassignment, due-date,
or reopening gates.

CRM29 controls must render only on CRM28 task-backed queue rows. They must not render on legacy
due-follow-up entries, `crm_activities` compatibility rows, or any union read model used by the
existing due-follow-up surface.

## Idempotency Contract

CRM29 must not accept caller-authored idempotency keys for Start or Complete controls.

If the implementation adds idempotency material around the existing CRM26 start/complete paths, the
key must be derived server-side from stable non-PII material: actor id, task id, action kind, and
expected lifecycle version. It must not include lead notes, follow-up free text, task copy, member
content, case narratives, document text, AI output, plate/VIN data, phone/email data, or localized
UI strings.

If CRM29 preserves the existing CRM26 input shape without adding an idempotency key, the
implementation must prove duplicate-click suppression plus lifecycle-version compare-and-set
behavior instead of inventing UI-supplied keys. A second click or parallel-tab retry after a
successful mutation is expected to resolve as an idempotent replay where CRM26 supports it or a
generic lifecycle conflict where the stale expected version no longer matches.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM29:

- Existing `/agent/crm` page and route-local component flow.
- Existing CRM26 `startCrmTaskAction` and `completeCrmTaskAction`.
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
- Staff/admin/member task controls are not introduced by CRM29.
- Invisible, absent, cross-tenant, cross-branch, unassigned, subject-invisible, terminal, or
  unsupported-subject tasks must all fail closed through existing CRM26 result envelopes.
- User-facing error copy must not distinguish absent tasks from invisible tasks.
- Rate-limited, stale-conflict, and transient repository failure states may have distinct generic
  copy when they do not expose hidden task existence or task counts.

## Domain Coupling Boundary

- CRM29 should reuse existing `@interdomestik/domain-crm/tasks` lifecycle helpers through the
  CRM26 server-action boundary.
- Route-local UI must not import database modules or mutate CRM task rows directly.
- Route-local UI may import only the public server actions or a narrow route-local action wrapper.
- `packages/domain-crm/src/tasks/*` must not import app code, database code, route code,
  localization, or rendering concerns.
- CRM29 must not create a parallel task lifecycle service outside `apps/web/src/actions/crm-tasks*`.
- CRM29 must not reintroduce legacy `crm_activities` writes or make task completion depend on
  legacy activity rows except through already-existing CRM27 compatibility behavior.
- UI components under `apps/web/src/components/**` or route-local component files must not import
  `packages/domain-crm/src/tasks/*` directly for lifecycle decisions. They receive the CRM28 queue
  DTO and call the CRM26 boundary or a route-local wrapper only.

## PII And Privacy Boundary

Action controls and result copy are operational metadata, not a place for raw customer or case
content.

Allowed UI/action material:

- stable localized labels for Start and Complete;
- task status, priority, due bucket, and existing stable reason-code labels;
- task id and lifecycle version submitted to the existing action boundary;
- generic success, conflict, rate-limit, unauthorized/unavailable, and retry copy.

Blocked UI/action material:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw user-authored task titles or descriptions;
- PII in action payload keys, idempotency keys, route params beyond existing lead id usage, audit
  metadata, logs, telemetry names, test snapshots, or error messages.

No AI behavior is introduced. CRM29 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## UI And Accessibility Contract

CRM29 is a bounded queue affordance, not a redesign.

- The existing `/agent/crm` route, layout, `agent-crm-page-ready` marker, and
  `agent-crm-task-queue-ready` marker must remain.
- Controls should live inside the existing queue rows and preserve the existing lead link.
- Start and Complete must be normal form/button controls with clear disabled/pending states.
- Buttons must be keyboard reachable and screen-reader distinguishable by task row context.
- Pending submissions must prevent duplicate clicks for the same action.
- A pending or failed mutation on one row must not disable, overwrite, or announce state for
  adjacent rows.
- Conflict or rate-limit states must be announced in an accessible, row-local way.
- On successful mutation that removes a row, focus must move to the next remaining queue row or to
  the queue heading if the queue is empty.
- Stable E2E markers may be added for the control surface, such as
  `agent-crm-task-queue-start` and `agent-crm-task-queue-complete`; markers should not embed task
  ids or PII-bearing values.
- Active app locale copy must be added for `sq`, `en`, `sr`, and `mk`.
- The compact layout must remain usable on mobile and dense desktop viewports. WCAG 2.1 AA is the
  review floor.

## Audit, Rate-Limit, And Revalidation Contract

CRM29 must rely on the existing CRM26 mutation boundary for:

- `logAuditEvent` audit records with `crm.task.started` and `crm.task.completed`;
- `enforceRateLimitForAction` mutation throttling;
- lifecycle-version compare-and-set behavior;
- locale-loop CRM revalidation.

The inherited CRM26 revalidation path set is `/{locale}/agent/crm`, `/{locale}/staff/crm`, and
`/{locale}/admin/crm` across active `LOCALES`. CRM29 must not add a new revalidation fanout unless
the implementation PR proves it is fixing a CRM26 bug. Existing lead-follow-up compatibility or lead
detail behavior that revalidates `/{locale}/agent/leads/{leadId}` remains separate and must not be
silently broadened by this queue-control slice.

CRM29 must not add parallel audit logging, custom rate-limit bypasses, or route-local revalidation
outside the existing boundary unless the implementation PR explicitly justifies a bug fix in the
CRM26 action layer.

Idempotent replay and stale lifecycle-version behavior must preserve existing CRM26 typed result
semantics.

## Side-Effect Contract

CRM29 may only start or complete existing visible CRM tasks through the CRM26 boundary.

It must not add:

- task create, assign, cancel, reopen, due-date update, bulk action, or inline edit UI;
- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, or outbox events;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill;
- task title/description/content persistence.

## Fail-Closed Rules

CRM29 must fail closed when:

- no authenticated agent session is available;
- tenant, actor, role, or branch scope cannot be derived from trusted session context;
- the target task is absent, invisible, cross-tenant, cross-branch, unassigned, terminal,
  unsupported, or subject-invisible;
- the task subject is not `lead`;
- the submitted lifecycle version is stale;
- the action is not `start` or `complete`;
- `start` is requested for a non-`pending` task;
- `complete` is requested for a terminal task;
- the mutation would require raw lead notes, follow-up free text, case narrative, medical facts,
  legal strategy, insurer correspondence, assistance summaries, document text, or AI output;
- implementation would require a new route, proxy edit, scheduler, notification, outbox, schema/RLS,
  auth, tenancy, routing, or architecture change.

Fail-closed UI for visibility and authorization denials must use a generic unavailable state and
must not distinguish absent from invisible work items.

## Result-To-Copy Mapping

CRM29 must map CRM26 results and domain denial reasons into stable, localized, non-PII UI buckets.
The UI should render bucketed copy only; it must not expose raw repository or denial reason strings.

| Copy bucket                       | Inputs mapped to the bucket                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue.action.error.unavailable`  | `unauthorized`, `forbidden`, `not_found`, `actor_scope`, `assignment_scope`, `branch_scope`, `role_scope`, `subject_not_found`, `subject_not_visible`, `subject_proof_missing`, `tenant_scope`, `invalid_assignment_target`, `invalid_due_at`, `invalid_idempotency_key`, `invalid_priority`, `invalid_reason_code`, `invalid_subject_reference`, `invalid_task_id`, `invalid_timestamp`, `non_monotonic_timestamp` |
| `queue.action.error.conflict`     | `conflict`, stale expected lifecycle version, `duplicate_idempotency_conflict`, `terminal_state`, `unsupported_transition`                                                                                                                                                                                                                                                                                          |
| `queue.action.error.rate_limited` | CRM26 action rate-limit result                                                                                                                                                                                                                                                                                                                                                                                      |
| `queue.action.error.transient`    | `repository_failure` or other retryable infrastructure failure                                                                                                                                                                                                                                                                                                                                                      |

Success copy may distinguish Start from Complete using stable action labels. Failure copy must not
distinguish absent work from invisible work.

## Non-Goals

- Staff/admin/member task queues or task-management surfaces.
- Task creation, assignment, cancellation, reopening, due-date editing, bulk action, drag/drop, or
  inline task content editing.
- New routes, API endpoints, route groups, canonical route aliases, or proxy edits.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, or outbox emission.
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
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture,
  Stripe, README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM28` is recorded as completed in `current-program.md` and `current-tracker.md` with PR
  `#839` and merge commit `f18b28b9b438b4ec6247da307d39c709544a35e4`.
- DG06 promotes only `P40-CRM29 Agent CRM Task Queue Start And Complete Controls`.
- CRM29 adds start and complete controls only to visible queue rows on the existing `/agent/crm`
  route.
- Controls render only for visible, assigned, open, lead-backed CRM tasks from the CRM28 queue DTO.
- `start` uses existing `startCrmTaskAction` with `manual_start`.
- `complete` uses existing `completeCrmTaskAction` with `resolved`.
- The submitted action payload contains only task id, expected lifecycle version, and stable reason
  code material.
- CRM29 is non-optimistic: controls remain pending/disabled until the server result returns, and
  stale expected-version responses render a generic conflict state.
- Start/Complete do not accept caller-authored idempotency keys; any idempotency material is
  server-derived from stable non-PII action context or the PR proves duplicate-click suppression and
  lifecycle-version conflict behavior without adding keys.
- Stale lifecycle-version, rate-limit, unauthorized, forbidden, not-found, and repository-failure
  results render generic non-PII copy without hidden-task disclosure.
- CRM26 results and domain denial reasons are mapped into stable locale keys rather than raw
  low-level error strings.
- Existing lead links, due-follow-up behavior, lead-detail completion behavior, canonical routes,
  and clarity markers remain unchanged.
- Start/Complete controls never appear on legacy due-follow-up or `crm_activities` compatibility
  rows.
- Active app locale labels are present for `sq`, `en`, `sr`, and `mk`.
- Focused tests cover control visibility, action payloads, result mapping, duplicate-click
  suppression, stale lifecycle conflicts, PII-safe copy, accessibility basics, and targeted agent
  CRM E2E behavior.
- No cancellation, reopening, assignment, due-date editing, staff/admin/member task UI, new routes,
  scheduler, notification, outbox, assistance execution, database migration/RLS, proxy, auth,
  tenancy, Stripe, README, AGENTS, or broad architecture-doc change is included.

## Implementation Review Plan

The CRM29 implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: no caller-supplied authority, no raw PII/case content in labels, payloads,
  errors, logs, telemetry, or snapshots; absent vs. invisible copy remains indistinguishable.
- Platform/runtime: existing CRM26 action boundary is reused; lifecycle-version conflicts,
  rate-limit behavior, audit events, result-to-copy mapping, and revalidation semantics remain
  consistent.
- Domain boundary: lifecycle state stays owned by `domain-crm` and CRM26; no parallel route-local
  lifecycle logic or database mutation path is introduced.
- Product/workflow: controls are useful but bounded; cancel/reopen/assign/due-date/scheduler work
  remains out of scope.
- QA/accessibility: existing gate behavior stays green, pending/disabled/conflict states are usable,
  keyboard/screen-reader behavior is covered, and existing clarity markers remain intact.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: inline controls can expand into broad task management. CRM29 must stop at Start and
  Complete.
- High: route-local UI could accidentally trust queue DTO visibility as authorization. The server
  action must still re-authorize every mutation through CRM26.
- High: stale lifecycle-version conflicts could produce confusing duplicate submissions. The UI
  needs deterministic pending and conflict states.
- High: two browser tabs can submit from different lifecycle versions. The stale tab resolving to a
  generic conflict state is expected behavior, not a defect.
- High: task action copy can leak hidden task existence if not-found and forbidden are separated in
  user-facing UI. These must collapse to generic unavailable copy.
- Medium: completing task-backed follow-ups from the queue may feel duplicative with the existing
  lead-detail completion path. The targeted E2E should prove both paths converge on the same task
  lifecycle behavior.
- Medium: legacy due-follow-up rows and task-backed queue rows coexist on `/agent/crm`. CRM29 must
  avoid rendering lifecycle controls on the legacy surface.
- Medium: using only `resolved` as the completion reason may be too coarse for future task types.
  This is acceptable for the first lead-backed queue control and can be expanded by a later gate.
- Medium: the queue may still be sparse because the only active producer is follow-up migration.
  This is acceptable; CRM29 improves operational closure for the existing producer only.

Rollback path: CRM29 should add no schema, route, proxy, cron, notification, scheduler, outbox, or
historical backfill. If behavior is wrong, rollback is a normal revert PR of queue controls, copy,
and focused tests, leaving CRM28 read-only queue behavior and CRM task persistence intact.

## Approval Bar

Approve DG06 only if:

- `P40-CRM28` predecessor proof is accepted as complete.
- Only `P40-CRM29 Agent CRM Task Queue Start And Complete Controls` is promoted.
- The promoted slice is agent-only, lead-backed, queue-row scoped, and rendered on the existing
  `/agent/crm` route.
- The promoted slice reuses existing CRM26 `startCrmTaskAction` and `completeCrmTaskAction`.
- Cancellation, reopening, assignment, due-date editing, scheduler/cron, reminders, notifications,
  outbox, templates, sequences, scoring, assistance-intent execution, database migrations/RLS,
  historical backfill, route/proxy/auth/tenancy changes, Stripe, README, AGENTS, and broad
  architecture-doc changes remain blocked.
- PII-safe action copy, server-side reauthorization, lifecycle-version conflict handling,
  duplicate-click suppression, result-to-copy buckets, legacy-row separation, focus management, and
  clarity-marker preservation are accepted as implementation requirements.

## Verification

Design-gate PR verification should include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs/tracker/program delta

Implementation proof for `P40-CRM29` should include:

- focused UI/core tests for queue control visibility and action payloads;
- focused CRM task action tests for start/complete result mapping and stale lifecycle-version
  behavior if existing coverage is insufficient;
- focused tests for generic not-found/forbidden/unavailable copy;
- focused tests proving no raw PII/case/follow-up free text enters labels, action payloads, errors,
  logs, telemetry, or snapshots;
- focused tests proving active locale labels resolve in `sq`, `en`, `sr`, and `mk`;
- accessibility proof for keyboard control access, pending/disabled states, and row-local conflict
  announcements;
- targeted update or preservation proof for `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`;
- `pnpm --filter @interdomestik/web type-check`;
- `pnpm --filter @interdomestik/web test:unit`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

No DB-side verification such as migration journal or RLS-table proof is required for CRM29 because
this gate does not propose database schema, migration, RLS, or historical backfill changes.

## Completion State

The status column reflects the intended state after the approved DG06 PR merges.

| Item                                                         | Status    | Decision                                                                           |
| ------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------- |
| `P40-CRM28 Agent CRM Task Work Queue UI Foundation`          | completed | Merged through PR `#839`, merge commit `f18b28b9b438b4ec6247da307d39c709544a35e4`. |
| `P40-DG06 CRM Task Queue Lifecycle Controls Design Gate`     | complete  | Approved design gate promoting the next bounded implementation slice.              |
| `P40-CRM29 Agent CRM Task Queue Start And Complete Controls` | pending   | Promoted agent-only queue lifecycle controls on the existing CRM page.             |
| Later P40 task management/scheduler/notification work        | reserved  | No implementation authority from this draft.                                       |
