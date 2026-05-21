# P40-DG04 CRM Lead Follow-Up Task Migration Design Gate

Status: complete
Slice: `P40-DG04`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-21
Authority: repo-canonical design gate. This gate closes
`P40-CRM26 CRM Task Application Service And Server Action Boundary` and promotes exactly one next
implementation slice.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                     |
| -------- | ---------- | ----------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-21 | Initial review draft after `P40-CRM26` runtime boundary merged.                           |
| `r2`     | 2026-05-21 | Review hardening for cutover, dedupe, coupling, result, idempotency, and audit contracts. |
| `r3`     | 2026-05-21 | Approved promotion to `P40-CRM27 Agent Lead Follow-Up To CRM Task Migration`.             |

## Definitions

- Lead follow-up workflow: the existing agent CRM schedule/complete workflow exposed through
  `/agent/crm` and `/agent/leads/[id]`.
- Legacy follow-up activity: a `crm_activities` row with `type = 'follow_up'`, currently used by
  the agent follow-up workflow and the `agent-crm-follow-up` gate.
- Task-backed follow-up: a `crm_tasks` row whose `subjectReference.kind` is `lead`,
  `createReasonCode` is `follow_up`, and `dueAt` carries the scheduled follow-up time.
- Migration: making new lead follow-up scheduling and completion go through the CRM task aggregate
  and CRM26 server-action boundary while preserving compatibility for existing legacy follow-up
  activity rows.
- Compatibility read path: a temporary read model that can surface both existing legacy follow-up
  activities and new task-backed follow-ups without double-counting or leaking visibility details.
- Runtime task work queue UI: broad task lists, filters, counters, or cross-role task management UI.
  This is not promoted here.
- Assistance intent execution: turning `domain-assistance` workflow intents into CRM side effects.
  This remains blocked; P39 intent output is advisory and uses `executionAllowed: false`.

## Predecessor Dependency

`P40-CRM26 CRM Task Application Service And Server Action Boundary` is the direct predecessor.

Predecessor proof:

- `P40-DG03 CRM Task Runtime Boundary Design Gate` is recorded in
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`.
- `P40-CRM26` merged as PR `#835`, merge commit
  `a70dda59463eeb664fd97804c8563653f46c9e04`, on 2026-05-21.
- PR `#835` added `apps/web/src/actions/crm-tasks.core.ts`,
  `apps/web/src/actions/crm-tasks.ts`, and `apps/web/src/actions/crm-tasks.core.test.ts`.
- The merged runtime boundary composes the CRM25 repository adapter with trusted session-derived
  actor context, typed `{ outcome: ... }` results, lifecycle-version conflict mapping, create
  idempotency/replay, PII-safe structural task output, audit, action rate limiting, locale-loop
  CRM revalidation, admin-equivalent role normalization, and focused service/action tests.

This gate must not reinterpret migration as broad CRM redesign, task-state recovery, scheduler
retry replay, notification fanout, or assistance-intent execution.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`, and
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`.
- CRM task runtime boundary: `apps/web/src/actions/crm-tasks.core.ts`,
  `apps/web/src/actions/crm-tasks.ts`, and `apps/web/src/actions/crm-tasks.core.test.ts`.
- Task domain and adapter contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`,
  `apps/web/src/adapters/crm/task-repository.ts`, and
  `apps/web/src/adapters/crm/task-repository.test.ts`.
- Existing follow-up domain contract and runtime boundary:
  `packages/domain-crm/src/leads/follow-up.ts`,
  `packages/domain-crm/src/leads/follow-up.test.ts`,
  `packages/domain-crm/src/lead-activities/index.ts`,
  `apps/web/src/actions/agent-crm-follow-up.core.ts`,
  `apps/web/src/actions/agent-crm-follow-up.ts`,
  `apps/web/src/actions/agent-crm-follow-up.core.test.ts`, and
  `apps/web/src/adapters/crm/lead-follow-up-repository.ts`.
- Legacy follow-up persistence schema:
  `@interdomestik/database/schema` exports `crmActivities`; existing adapter code writes
  `crmActivities.type = CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE`.
- Existing CRM dashboard/read-model inputs:
  `packages/domain-crm/src/dashboards/index.ts`,
  `packages/domain-crm/src/dashboards/index.test.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`, and
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`.
- Existing lead-detail inputs:
  `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/page.tsx`, and
  `apps/web/e2e/golden/agent-lead-detail.spec.ts`.
- Existing timeline/read-model input:
  `packages/domain-crm/src/timeline/read-model.ts`. CRM27 may not silently change timeline event
  semantics without naming the change in the implementation PR.
- Existing gate proof for the legacy workflow:
  `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.

## Decision

Promote exactly one next implementation slice:

`P40-CRM27 Agent Lead Follow-Up To CRM Task Migration`

The promoted slice migrates the existing agent lead follow-up workflow from new `crm_activities`
follow-up writes to the CRM task aggregate and CRM26 server-action boundary. It should keep the
current `/agent/crm` and `/agent/leads/[id]` user workflow stable while making `crm_tasks` the
canonical persistence path for newly scheduled follow-ups.

## Candidate Ranking

| Rank | Candidate                                              | Decision | Rationale                                                                                                      |
| ---- | ------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM27 Agent Lead Follow-Up To CRM Task Migration` | Promote  | CRM26 is complete; migrating an existing workflow gives the task aggregate a real consumer before broad UI.    |
| 2    | CRM task work queue UI foundation                      | Defer    | A broad task UI should follow a real migrated workflow, otherwise it risks rendering an empty parallel system. |
| 3    | Due-task scheduler and reminders                       | Defer    | Scheduler fanout needs notification, retry, cron, and abuse-control design after migration semantics settle.   |
| 4    | CRM task templates or sequences                        | Defer    | Templates and sequences depend on stable task consumers plus scheduler/notification semantics.                 |
| 5    | Assistance intent execution into CRM tasks             | Reject   | P39 assistance workflow intents remain advisory and `executionAllowed: false`.                                 |

## Promoted CRM27 Scope

Authorized implementation scope for CRM27:

- Make newly scheduled agent lead follow-ups create `crm_tasks` records with:
  - `subjectReference.kind = 'lead'`;
  - `subjectReference.id = leadId`;
  - `createReasonCode = 'follow_up'`;
  - `dueAt = scheduledAt`;
  - assignment to the current authorized agent;
  - priority chosen from the existing CRM task priority set, with `normal` as the default unless
    the implementation PR justifies another mapped value.
- Route new schedule and complete operations through the CRM26 task server-action/core boundary or
  a small internal composition layer that reuses the CRM26 boundary semantics.
- Preserve existing agent session, tenant, branch, and role authorization behavior.
- Preserve current user-facing workflow and existing route/test-id contracts for `/agent/crm` and
  `/agent/leads/[id]` unless the implementation PR explicitly proves a tiny compatibility change is
  unavoidable.
- Add or adapt a compatibility read model so due follow-ups can show both legacy `crm_activities`
  follow-ups and new task-backed follow-ups during transition.
- Stop creating new legacy `crm_activities` follow-up rows from the schedule path once the task
  creation path is active.
- Keep existing legacy follow-up activity completion available only for pre-existing legacy rows
  that are still visible through the compatibility read path.
- Add focused tests for new task-backed scheduling, completion, due-list visibility, legacy
  compatibility, no duplicate display, branch/tenant denial, stale lifecycle conflicts, and
  no new `crm_activities` writes on the migrated schedule path.

Expected implementation delta should stay focused on:

- `apps/web/src/actions/agent-crm-follow-up*.ts`;
- `apps/web/src/actions/crm-tasks*.ts` only if a small exported helper is needed and justified;
- `apps/web/src/adapters/crm/lead-follow-up-repository.ts` or a replacement compatibility adapter;
- existing agent CRM and lead-detail core/page tests;
- `packages/domain-crm/src/dashboards/*` for pure compatibility read derivation when the logic is
  shared by dashboard/page code;
- `packages/domain-crm/src/leads/follow-up.ts` only for deprecation wrappers or type-preserving
  compatibility, not for new cross-aggregate task imports;
- `packages/domain-crm/src/lead-activities/*` as read-only legacy activity compatibility unless
  the implementation PR proves a small guarded legacy-completion helper is required;
- targeted update to `apps/web/e2e/gate/agent-crm-follow-up.spec.ts` so the existing workflow proves
  task-backed behavior.

## Migration Contract

CRM27 should be a live-workflow migration, not a historical data backfill.

Cutover strategy:

- Chosen strategy: single-write / union-read. New schedule writes go only to `crm_tasks`; read
  paths temporarily union task-backed follow-ups with legacy `crm_activities` follow-ups.
- Rejected: hard cutover. Existing open legacy activity rows must not disappear on deploy.
- Rejected: dual-write. New schedule operations must not write both `crm_tasks` and
  `crm_activities`, because that would create duplicate side effects and conflicting audit trails.
- Rejected: read-replication/backfill. CRM27 must not copy all legacy activity rows into tasks or
  delete legacy rows.
- Deferred: historical backfill and retention cleanup for legacy follow-up activities.

Required behavior:

- New schedule writes go to `crm_tasks`, not `crm_activities`.
- Existing open legacy follow-up activity rows remain visible until completed or naturally removed
  by later retention/backfill work.
- Legacy activity rows and task-backed rows must not double-count the same follow-up in dashboard
  counts or lead next-action derivation.
- During the transition window, `crm_tasks` is canonical for any follow-up created after CRM27
  deploys. Legacy activity rows are compatibility-only and must not be extended with new features.
- The read-side dedupe key is `(tenantId, actorId, leadId, normalizedScheduledAt)`. If a visible
  task-backed row and a visible legacy activity row collide on that key, the task-backed row wins
  and the legacy row is suppressed from task/due displays.
- Due-list ordering must be deterministic by due/scheduled timestamp, then source rank
  `crm_task` before `legacy_activity`, then stable backing id.
- Completion must target the backing record type deterministically. A task-backed row completes the
  `crm_tasks` record; a legacy row completes the legacy activity through the existing guarded path.
- The UI may use a stable structural discriminator such as `source: 'legacy_activity' | 'crm_task'`
  in internal DTOs. User-facing copy should not expose implementation-source labels.
- No historical backfill, destructive migration, or deletion of legacy activity rows is authorized.

The existing follow-up `subject` free-text field does not have a CRM task equivalent. CRM27 must not
stuff free text into task ids, reason codes, audit metadata, or display-only fields. The default
display label for task-backed follow-ups should be a stable localized UI label such as "Follow-up"
plus due date and lead context already authorized by the existing page. If preserving legacy
free-text follow-up subject is required, it needs a separate task-label/title contract gate.

## Operation Contract

Schedule follow-up:

- Requires an authorized agent session with branch scope.
- Requires a durable `lead` subject visible to the actor.
- Creates a CRM task through the CRM26 semantics with a deterministic idempotency key derived from
  tenant id, actor id, lead id, normalized scheduled time, and the literal operation intent
  `lead_follow_up_schedule`. The key must not include free-text subject or description content.
- Before creating a task, the schedule path must query visible open legacy follow-up activities for
  the same dedupe key. If one exists, the action must return a compatibility result without
  creating a duplicate task. This handles retry requests crossing the CRM27 deploy boundary.
- Does not create a new `crm_activities` follow-up row.
- Revalidates the same existing CRM paths as the current action: `/agent/crm` and
  `/agent/leads/[id]` through the locale loop.

Complete follow-up:

- For task-backed follow-ups, requires `taskId` and `expectedLifecycleVersion`, then completes the
  CRM task with a stable completion reason such as `resolved` or `manually_closed`.
- For legacy activity follow-ups, may keep the existing legacy completion path only for rows already
  created before this migration.
- Stale task lifecycle versions must return a typed conflict and must not silently retry.
- Absent vs. invisible task or legacy activity rows must not be distinguishable in user-facing copy.

Read follow-ups:

- Due-list and next-action derivation must include task-backed follow-ups whose `dueAt` is due and
  whose status is open.
- Future scheduled task-backed follow-ups must remain out of the due queue but may appear as the
  next scheduled action where the existing page already supports that display.
- Cross-tenant, cross-branch, cross-agent, unsupported subject, and completed/cancelled task rows
  must remain invisible.

## Result Envelope And Deprecation Contract

CRM27 must not accidentally create two public result-envelope conventions for the same workflow.

- Existing UI callers of `agent-crm-follow-up` may keep receiving the legacy
  `AgentCrmFollowUpActionResult` / `CrmLeadFollowUpResult` shape during CRM27 to avoid a broad UI
  rewrite.
- Internally, task-backed operations must consume and normalize CRM26 `{ outcome: ... }` results.
  Any adapter from CRM26 outcomes to the legacy follow-up result shape must be explicit and tested.
- New task-backed code must not add new variants to `CrmLeadFollowUpResult` unless the
  implementation PR names it as a contract change.
- `CreateCrmLeadFollowUpActivity` and `CrmLeadFollowUpRepository` become legacy-compatibility
  types after CRM27. They may remain for pre-existing activity completion and tests, but new
  schedule writes must not depend on them.
- `CrmLeadNextAction` may be preserved as a compatibility read DTO, but its backing source must be
  explicit in app/internal data before rendering.
- A later cleanup gate may deprecate or remove the legacy result/types after legacy activity rows no
  longer need compatibility. CRM27 does not remove them.

## Consumer Inventory

CRM27 implementation must inventory and update every affected consumer of lead follow-up contracts.
Current known consumers:

- `apps/web/src/actions/agent-crm-follow-up.core.ts` and
  `apps/web/src/actions/agent-crm-follow-up.ts` consume `CrmLeadFollowUpResult` through the agent
  action boundary.
- `apps/web/src/adapters/crm/lead-follow-up-repository.ts` implements
  `CrmLeadFollowUpRepository`, creates legacy follow-up activities, completes legacy activities,
  and lists legacy follow-up rows.
- `packages/domain-crm/src/dashboards/index.ts` exports
  `CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE` and derives agent CRM due follow-up DTOs from activity rows.
- `apps/web/src/adapters/crm/dashboard-repository.ts` filters `crmActivities.type =
CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE` for due follow-up reads.
- `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts` consumes the dashboard due-follow-up
  read model.
- `apps/web/src/features/agent/leads/components/AgentLeadDetailV2Page.tsx` imports
  `deriveCrmLeadNextAction` and `CrmLeadNextAction`.
- `apps/web/src/app/[locale]/(agent)/agent/leads/[id]/_core.ts` and page tests consume the
  lead-detail next-action behavior.
- `packages/domain-crm/src/timeline/read-model.ts` maps generic lead activities into the CRM
  timeline. CRM27 must not silently change timeline semantics for task-backed follow-ups; timeline
  migration is a separate explicit decision unless the implementation PR proves a tiny derived
  compatibility item is necessary.
- `apps/web/e2e/gate/agent-crm-follow-up.spec.ts` and
  `apps/web/e2e/golden/agent-lead-detail.spec.ts` seed or assert legacy follow-up activity
  behavior and must be updated or preserved deliberately.

Acceptance proof must include an `rg`-backed import/use inventory in the PR description or tests,
showing no consumer of `CrmLeadFollowUpResult`, `CrmLeadNextAction`,
`CreateCrmLeadFollowUpActivity`, `CrmLeadFollowUpRepository`, or
`CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE` was silently broken.

## Domain Coupling Boundary

- `packages/domain-crm/src/tasks/*` must remain the canonical CRM task aggregate and must not import
  from `packages/domain-crm/src/leads/*`, `packages/domain-crm/src/lead-activities/*`, timeline
  read models, app code, or database code.
- `packages/domain-crm/src/leads/follow-up.ts` must not import from
  `packages/domain-crm/src/tasks/*`. After CRM27 it is compatibility/deprecation-track code, not a
  new task orchestration module.
- `packages/domain-crm/src/lead-activities/*` must not import from
  `packages/domain-crm/src/tasks/*`; legacy activity support remains a separate aggregate/read
  concern.
- Cross-aggregate compatibility composition belongs in `packages/domain-crm/src/dashboards/*` for
  pure read derivation or in app-side adapters/actions where runtime repositories are already
  composed.
- App-side code may import CRM26 task actions, the CRM task repository adapter through CRM26, and
  legacy follow-up adapters for compatibility, but must not write task tables directly.

## Audit And Rate-Limit Contract

CRM27 must preserve audit and rate-limit behavior across the cutover.

- Task-backed schedule and complete operations emit the CRM26 `crm.task.*` audit events.
- During CRM27, the follow-up action boundary must also preserve audit continuity for existing
  operational observers by either emitting a structural legacy-continuity event such as
  `crm.lead.follow_up.scheduled` / `crm.lead.follow_up.completed` with `backing: 'crm_task'`, or
  documenting in the implementation PR that all consumers are moved to `crm.task.*`. The preferred
  path is a structural continuity event if an existing legacy audit channel exists.
- Legacy activity completions may keep their current audit behavior, but must not gain new
  non-structural metadata.
- Audit metadata must not include follow-up subject/description free text, lead notes, emails,
  phone numbers, messages, legal strategy, assistance summaries, or document text.
- CRM27 must reuse CRM26 action rate limiting for task-backed schedule/complete operations. Any
  legacy compatibility completion path must keep the existing action protection or add an equivalent
  `enforceRateLimitForAction` guard if missing.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM27:

- Existing `agent-crm-follow-up` action/core entrypoints.
- Existing CRM26 task server-action/core functions.
- Existing `/agent/crm` and `/agent/leads/[id]` page/core flows.
- Focused test-only fixture helpers.

Unauthorized entrypoints:

- New `app/api/**/route.ts` HTTP route handlers.
- New `app/api/cron/crm/**/route.ts` cron route handlers.
- New route groups, route aliases, middleware, proxy edits, or canonical route rewrites.
- New `/member`, `/staff`, or `/admin` task UI or action surfaces from this slice.
- New assistance runtime UI or assistance-to-CRM execution surface.

`apps/web/src/proxy.ts` must remain untouched.

## Authorization And Data Boundary

- Runtime effects must go through the CRM26 task boundary or a small wrapper that preserves its
  session, actor, tenant, branch, lifecycle-version, idempotency, audit, rate-limit, and
  revalidation semantics.
- The implementation must not bypass the CRM task repository with direct task-table writes from the
  follow-up action.
- The agent follow-up workflow remains agent-only and branch-scoped. Staff/admin task management is
  not introduced by CRM27.
- UI/client payloads must not be trusted for tenant, branch, role, actor id, assignment authority,
  or subject visibility.
- The implementation PR must include proof that no new route/proxy/auth/tenancy path was added.

## PII And Privacy Boundary

Task-backed follow-ups are structural CRM work items. CRM27 must not introduce new raw or sensitive
content storage/display.

Allowed task-backed data:

- task id;
- lead subject id;
- status, priority, reason codes;
- due date and timestamps;
- assignment kind/id;
- lifecycle version;
- stable source discriminator for compatibility reads.

Blocked task-backed data:

- legacy free-text follow-up subject/description copied into task ids, reason codes, audit
  metadata, idempotency keys, or new task fields;
- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, or AI summaries.

No AI behavior is introduced. CRM27 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## Side-Effect Contract

CRM27 may trigger only user-initiated schedule/complete follow-up behavior for existing agent CRM
flows. It must not add:

- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, or outbox events;
- broad work queue UI;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill.

Revalidation remains limited to existing localized `/agent/crm` and `/agent/leads/[id]` paths.

## Fail-Closed Rules

CRM27 must fail closed when:

- no authenticated agent session is available;
- the actor lacks branch scope;
- the lead subject is unsupported, absent, cross-tenant, cross-branch, or not assigned/visible to
  the actor;
- migrated follow-up schedule writes attempt to use `deal`, `support_handoff`, `account`, or
  `contact` task subjects instead of `lead`;
- schedule input has an invalid due timestamp;
- a deterministic idempotency key would include free-text subject or description content;
- a deploy-boundary retry sees an equivalent open legacy follow-up activity and would otherwise
  create a duplicate task;
- task creation would require raw follow-up text storage;
- completion lacks `expectedLifecycleVersion` for a task-backed follow-up;
- CRM26 returns `unauthorized`, `forbidden`, `not_found`, `conflict`, `invalid_input`,
  `rate_limited`, or `repository_failure`;
- a compatibility read would double-count one follow-up;
- action success would imply scheduler, notification, assistance, claim, support-handoff,
  Professional Recovery, agreement, POA, billing, or third-party-submission authority;
- implementation would require a route, proxy, auth, tenancy, schema, RLS, or architecture change.

Fail-closed UI must not distinguish absent vs. invisible leads/tasks in user-facing copy.

## Non-Goals

- Broad CRM task work queue UI, cross-role task management, task filters, counters, or staff/admin
  task surfaces.
- New routes, API endpoints, route groups, canonical route aliases, or proxy edits.
- `/member` task UI or member task actions.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, or outbox emission.
- CRM templates, sequences, scoring, campaign automation, consent/preference implementation, or
  automated routing triggers.
- Historical data backfill, destructive migration, or deletion of legacy `crm_activities` rows.
- Account/contact durable persistence or account/contact task subject activation.
- Assistance-session intent execution, CRM lead creation from assistance, claim creation,
  support-handoff creation, Professional Recovery activation, billing, finance, agreement, POA,
  assignment, or airline/insurer/third-party submission workflows.
- Database schema, migrations, RLS, or DB-access baseline changes.
- Task-state recovery, paused-task resume, retry replay infrastructure, or user workflow
  rehydration.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture,
  Stripe, README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM26` is recorded as completed in `current-program.md` and `current-tracker.md`.
- DG04 promotes only `P40-CRM27 Agent Lead Follow-Up To CRM Task Migration`.
- New agent lead follow-up schedule writes create CRM tasks and do not create new legacy
  `crm_activities` follow-up rows.
- CRM27 uses a named single-write / union-read cutover strategy and rejects dual-write, hard
  cutover, historical backfill, and destructive cleanup.
- Existing open legacy follow-up activities remain visible and completable through a bounded
  compatibility path.
- Task-backed rows win over legacy rows on the transition dedupe key
  `(tenantId, actorId, leadId, normalizedScheduledAt)`.
- Task-backed follow-ups appear in the existing due-list and lead next-action behavior without
  double-counting legacy rows.
- Due-list ordering is deterministic by due/scheduled time, source rank, and backing id.
- Task-backed completion requires `expectedLifecycleVersion` and handles stale conflicts
  deterministically.
- Authorization remains agent-only, tenant-scoped, and branch-scoped.
- Migrated schedule writes use only `lead` task subjects.
- Task-backed follow-up data remains structural and PII-safe; legacy free text is not copied into
  task ids, reason codes, audit metadata, idempotency keys, or new task fields.
- Deploy-boundary retries cannot create both a legacy activity row and a task-backed row for the
  same follow-up.
- Result-shape compatibility is explicit: UI-facing legacy result wrappers are preserved or changed
  only through a named contract change.
- Consumer inventory for `CrmLeadFollowUp*`, `CrmLeadNextAction`, and
  `CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE` is included in implementation proof.
- Audit continuity is explicit for task-backed schedule/complete and legacy compatibility
  completion.
- Existing canonical routes and clarity markers remain unchanged.
- Focused tests cover task-backed schedule, task-backed complete, legacy compatibility, no duplicate
  display, branch/tenant denial, stale conflict handling, and no new legacy activity writes.
- No broad task UI, scheduler, notification, outbox, assistance execution, database migration/RLS,
  proxy, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc change is included.

## Implementation Review Plan

The CRM27 implementation PR must include independent review evidence before
merge. Reviewer areas:

- Security/privacy: no new caller-supplied authority, no PII copied into task material, absent vs.
  invisible copy remains indistinguishable, and no assistance/privacy cross-domain execution.
- Platform/runtime: CRM26 boundary reuse, typed outcome handling, lifecycle-version conflict
  behavior, idempotency, audit/rate-limit preservation, revalidation discipline, and no
  route/proxy/auth/tenancy changes.
- Domain boundary: task aggregate becomes the canonical new follow-up write path; legacy activity
  support remains compatibility-only and cannot grow.
- Product/workflow: current agent CRM follow-up workflow remains stable while broad task UI,
  scheduler, notifications, templates, sequences, and assistance execution remain blocked.
- QA/accessibility: existing gate behavior stays green, task-backed rows are exercised, legacy rows
  remain visible, and no duplicate due-row behavior is introduced.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: legacy follow-up free text has no CRM task field. CRM27 should not invent a hidden title
  field; if preserving free text is required, a separate task-label/title contract gate is needed.
- High: dual-read compatibility can double-count rows. The implementation needs deterministic
  source discrimination and focused tests.
- High: follow-up actions can bypass CRM26 if implemented as direct repository writes. The PR needs
  boundary-reuse proof.
- High: audit consumers can miss new task-backed follow-up events if they only watch legacy
  follow-up audit codes. CRM27 must prove continuity or document consumer migration.
- Medium: legacy activity completion must remain only a compatibility path. It should not keep
  creating or extending legacy activity behavior.
- Medium: due-list ordering across legacy and task-backed rows must be stable by scheduled/due time.
- Medium: dropping legacy free-text follow-up subjects from task-backed display is a product-visible
  UX change. The PR should either accept the stable "Follow-up" label deliberately or route
  task-title support through a later design gate.
- Medium: legacy completion paths return `CrmLeadFollowUpResult`, while task-backed paths return
  CRM26 `{ outcome: ... }` internally. UI-facing adapters must normalize both paths explicitly.
- Medium: broad task UI will still be needed after migration, but should be a later gate once real
  task-backed workflow data exists.

Rollback path: CRM27 should add no schema, route, proxy, cron, notification, or historical backfill.
If migration behavior is wrong, rollback is a normal revert PR of follow-up action/read-model files
and focused tests, leaving CRM26 runtime boundary, CRM25 persistence, and legacy activity rows
intact. Task rows written between cutover and rollback with `createReasonCode = 'follow_up'` are
left in place and ignored by the reverted legacy read path; no destructive cleanup is authorized by
DG04. A later cleanup or reconciliation gate must handle any orphaned task-backed follow-ups if a
rollback occurs after production writes.

## Approval Bar

Approve DG04 only if:

- `P40-CRM26` predecessor proof is accepted as complete.
- The tracker/program closeout proof for PR `#835` is explicitly recorded.
- Only `P40-CRM27 Agent Lead Follow-Up To CRM Task Migration` is promoted.
- The promoted slice makes new agent lead follow-ups task-backed while preserving legacy activity
  compatibility.
- The cutover strategy is accepted as single-write / union-read, with task-backed rows canonical
  after deploy and legacy activity rows compatibility-only.
- Result-shape compatibility, consumer inventory, deploy-boundary idempotency, and audit continuity
  are accepted as implementation requirements.
- The design blocks broad task UI, new routes, proxy changes, auth/tenancy/routing refactors,
  scheduler/cron, reminders, notifications, outbox, templates, sequences, scoring,
  assistance-intent execution, database migrations/RLS, historical backfill, Stripe, README,
  AGENTS, and broad architecture-doc changes.

## Verification

Design-gate PR verification should include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs-only delta

Implementation proof for `P40-CRM27` should include:

- focused unit tests for task-backed schedule and complete behavior;
- focused compatibility tests for pre-existing legacy `crm_activities` follow-ups;
- focused tests proving new schedule writes do not insert legacy follow-up activity rows;
- focused tests proving legacy/task dedupe and deterministic ordering;
- focused deploy-boundary retry tests proving an equivalent legacy activity suppresses duplicate
  task creation;
- focused stale lifecycle-version and typed failure tests;
- focused PII/idempotency/audit metadata tests;
- focused result-normalization tests for legacy and task-backed completion paths;
- consumer inventory proof for `CrmLeadFollowUp*`, `CrmLeadNextAction`, and
  `CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE`;
- targeted update to `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`;
- `pnpm --filter @interdomestik/domain-crm type-check`;
- `pnpm --filter @interdomestik/domain-crm test:unit`;
- `pnpm --filter @interdomestik/web type-check`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

No DB-side verification such as migration journal or RLS-table proof is required for CRM27 because
this gate does not propose database schema, migration, RLS, or historical backfill changes.

## Completion State

The status column reflects the intended state after the approved DG04 PR merges.

| Item                                                                | Status    | Decision                                                                           |
| ------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `P40-CRM26 CRM Task Application Service And Server Action Boundary` | completed | Merged through PR `#835`, merge commit `a70dda59463eeb664fd97804c8563653f46c9e04`. |
| `P40-DG04 CRM Lead Follow-Up Task Migration Design Gate`            | completed | This gate promotes the next bounded migration slice.                               |
| `P40-CRM27 Agent Lead Follow-Up To CRM Task Migration`              | promoted  | Task-backed follow-up migration through CRM26.                                     |
| Later P40 work queue/scheduler/notification/template/sequence work  | reserved  | No implementation authority from this design gate.                                 |
