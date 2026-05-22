# P40-DG05 CRM Task Work Queue UI Foundation Design Gate

Status: complete
Slice: `P40-DG05`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-21
Authority: repo-canonical design gate. This gate closes
`P40-CRM27 Agent Lead Follow-Up To CRM Task Migration` and promotes exactly one next
implementation slice.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                       |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-21 | Initial review draft after `P40-CRM27` follow-up migration.                                                 |
| `r2`     | 2026-05-21 | Review hardening for read pattern, UI coupling, coexistence, lead display, accessibility, and locale proof. |
| `r3`     | 2026-05-21 | Approved promotion to `P40-CRM28 Agent CRM Task Work Queue UI Foundation`.                                  |

## Definitions

- CRM task work queue: a bounded list of visible CRM task work items for an authorized actor. This
  gate scopes the first work queue to the existing agent CRM surface only.
- Agent task queue foundation: a read-only queue panel on the existing `/agent/crm` page that shows
  assigned, open, lead-backed CRM tasks created through the CRM task aggregate.
- Lead-backed CRM task: a `crm_tasks` row whose `subjectReference.kind` is `lead`. The only
  currently migrated producer is the lead follow-up workflow with `createReasonCode = 'follow_up'`.
- Open task: a task whose status is `pending` or `in_progress`.
- Work queue read model: a PII-safe DTO derived from visible CRM task rows for rendering. It is not
  a mutation boundary and does not create, update, complete, cancel, assign, or schedule tasks.
- CRM26 boundary: the existing task application-service/server-action boundary in
  `apps/web/src/actions/crm-tasks.core.ts`.
- Runtime task management: broad CRUD, assignment, filters, staff/admin queues, scheduler,
  reminders, notifications, templates, sequences, scoring, or cross-role task operations. This is
  not promoted here.
- Assistance intent execution: turning `domain-assistance` workflow intents into CRM side effects.
  This remains blocked; P39 intent output is advisory and uses `executionAllowed: false`.

## Predecessor Dependency

`P40-CRM27 Agent Lead Follow-Up To CRM Task Migration` is the direct predecessor.

Predecessor proof:

- `P40-DG04 CRM Lead Follow-Up Task Migration Design Gate` is recorded in
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`.
- `P40-CRM27` merged as PR `#837`, merge commit
  `5421a09b29624492dc54476ec3585cc7a06df20e`, on 2026-05-21.
- PR `#837` made new agent lead follow-up scheduling write CRM tasks through the CRM26 boundary,
  preserved bounded compatibility for existing legacy `crm_activities` follow-up rows, made
  task-backed rows canonical in union reads, and updated focused proof for the agent CRM follow-up
  workflow.
- The existing `/agent/crm` page now has real task-backed workflow data available through the
  migrated lead follow-up path, which satisfies DG04's reason for deferring broad task UI until
  after a real consumer existed.

This gate must not reinterpret work queue foundation as cross-role task management, staff/admin
operations, scheduler runtime, notification fanout, or assistance-intent execution.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior P40 gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`,
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`,
  `docs/plans/2026-05-21-p40-dg03-crm-task-runtime-boundary-design.md`, and
  `docs/plans/2026-05-21-p40-dg04-crm-lead-follow-up-task-migration-design.md`.
- CRM task domain contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, and `packages/domain-crm/src/tasks/index.ts`.
- CRM task persistence/runtime boundary: `apps/web/src/adapters/crm/task-repository.ts`,
  `apps/web/src/adapters/crm/task-repository.test.ts`,
  `apps/web/src/actions/crm-tasks.core.ts`, `apps/web/src/actions/crm-tasks.ts`, and
  `apps/web/src/actions/crm-tasks.core.test.ts`.
- Migrated follow-up workflow: `apps/web/src/actions/agent-crm-follow-up.core.ts`,
  `apps/web/src/actions/agent-crm-follow-up.ts`,
  `apps/web/src/actions/agent-crm-follow-up.core.test.ts`,
  `apps/web/src/adapters/crm/lead-follow-up-repository.ts`, and
  `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`.
- Existing agent CRM page and dashboard read model:
  `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`,
  `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`,
  `packages/domain-crm/src/dashboards/index.ts`, and
  `apps/web/src/adapters/crm/dashboard-repository.ts`.
- Existing lead-detail rendering target:
  `apps/web/src/features/agent/leads/components/AgentLeadDetailV2Page.tsx`; the queue may link to
  the existing canonical `/agent/leads/[id]` route but must not assume a route-local lead-detail
  core file exists.
- Existing localization inputs: `apps/web/src/messages/en/agent-crm.json` and sibling locale files
  for the active app locales from `apps/web/src/i18n/locales.ts`: `sq`, `en`, `sr`, and `mk`.

## Decision

Promote exactly one next implementation slice:

`P40-CRM28 Agent CRM Task Work Queue UI Foundation`

The promoted slice adds a bounded, read-only CRM task work queue foundation to the existing
`/agent/crm` surface. It should show assigned, visible, open, lead-backed CRM tasks created through
the CRM task aggregate, starting with the task-backed follow-up workflow from CRM27.

The implementation may add a focused task work-queue read model and app-side query adapter. It must
not add broad task management, cross-role queues, scheduler behavior, new routes, or task mutation
UI.

## Candidate Ranking

| Rank | Candidate                                           | Decision | Rationale                                                                                                                       |
| ---- | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM28 Agent CRM Task Work Queue UI Foundation` | Promote  | CRM27 provides real task-backed workflow data; the next bounded step is a read-only queue on the existing agent CRM surface.    |
| 2    | Staff/admin task management surfaces                | Defer    | Cross-role management needs explicit assignment, visibility, and escalation design after the agent foundation proves the shape. |
| 3    | Due-task scheduler and reminders                    | Defer    | Scheduler fanout needs cron, notification, retry, abuse-control, and observability design.                                      |
| 4    | Task titles, descriptions, templates, or sequences  | Defer    | User-authored task content and automation templates need separate PII, localization, and lifecycle contracts.                   |
| 5    | Assistance intent execution into CRM tasks          | Reject   | P39 assistance workflow intents remain advisory and `executionAllowed: false`.                                                  |

## Promoted CRM28 Scope

Authorized implementation scope for CRM28:

- Add a read-only agent task queue panel to the existing `/agent/crm` page.
- Surface only visible CRM tasks that are:
  - tenant-scoped to the current session tenant;
  - branch-visible to the current agent through existing CRM task adapter rules;
  - assigned to the current actor or the current actor's agent identity;
  - open (`pending` or `in_progress`);
  - `subjectReference.kind = 'lead'`;
  - backed by a subject the actor is allowed to see.
- Render stable structural fields only: task id, lead subject id, a PII-safe lead display
  reference, status, priority, due date, create reason code, lifecycle version, and a localized
  stable label such as "Follow-up".
- Link lead-backed rows to the existing canonical `/agent/leads/[id]` route.
- Add a small pure work-queue read-model contract under `packages/domain-crm/src/tasks/*` or
  another focused `domain-crm` module if shared sorting/DTO derivation belongs outside app code.
- Add an app-side query adapter over existing `crm_tasks` persistence for the queue read path. This
  may be a separate read repository instead of widening the mutation-oriented `CrmTaskRepository`
  port.
- Keep the existing due follow-up list and lead-detail next-action behavior stable.
- Add focused tests for query scoping, deterministic ordering, DTO redaction, empty-state behavior,
  lead-link rendering, clarity-marker preservation, and the existing agent follow-up gate.

Expected implementation delta should stay focused on:

- `packages/domain-crm/src/tasks/*` for pure queue DTO/sort/filter contracts and tests;
- `apps/web/src/adapters/crm/*task*queue*` or a similarly narrow app-side read adapter and tests;
- `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`;
- `apps/web/src/app/[locale]/(agent)/agent/crm/page.tsx`;
- existing agent CRM page tests and targeted E2E gate coverage;
- agent CRM message files for stable localized labels.

## Work Queue Read Contract

CRM28 should define a deterministic, PII-safe read shape before rendering.

The queue must be consumed through the existing server-rendered `/agent/crm` page pattern:
`_core.ts` loads the queue data through a server-side read function or app-side read adapter, then
passes DTOs into presentational components. CRM28 must not add client-side fetches, HTTP route
handlers, or server-action-from-client reads for this queue.

The new queue reads task-backed rows only. It does not reuse the DG04 follow-up union DTO
(`legacy_activity | crm_task`) and does not treat legacy `crm_activities` rows as tasks. The
existing due-follow-up list may keep its bounded compatibility read shape on the same page; the two
surfaces coexist without sharing DTOs or double-counting semantics.

Required queue item fields:

- `taskId`;
- `subjectReference` limited to `kind: 'lead'` and `id`;
- `leadDisplayRef`, a PII-safe display projection sourced from an already authorized lead-summary
  read path, such as a short stable lead handle or display name that excludes phone, email, notes,
  claim narrative, medical facts, legal strategy, and message text;
- `status`;
- `priority`;
- `dueAt`;
- `createReasonCode`;
- `lifecycleVersion`;
- `displayLabelCode`, such as `follow_up`, not caller-authored text;
- `href` or route descriptor pointing to the existing lead detail route;
- `dueBucket` such as `overdue`, `due_today`, `upcoming`, or `undated`.

Ordering must be deterministic:

- open tasks only;
- overdue and dated tasks before undated tasks;
- earlier `dueAt` before later `dueAt`;
- higher priority as a tie-breaker using the existing priority order `urgent`, `high`, `normal`,
  `low`;
- stable `taskId` as the final tie-breaker.

The first implementation should use a bounded page-size limit of 10 rows and no infinite scroll.
Pagination, saved filters, cross-role views, and bulk actions are later gates.

## Authorization And Data Boundary

- The read path must derive tenant, actor, role, and branch scope from the authenticated session.
- UI/client input must not be trusted for tenant id, branch id, role, actor id, assignment scope, or
  subject visibility.
- Agent actors remain branch-scoped. Staff/admin task queues are not introduced by CRM28.
- The app-side adapter must preserve the current CRM task visibility posture: non-admin actors are
  branch-scoped, and absent vs. invisible rows must not be distinguishable in user-facing copy.
- The queue must not show cross-tenant, cross-branch, unassigned, completed, cancelled, unsupported
  subject, or subject-invisible tasks.
- Lead-backed task links may use the existing canonical `/agent/leads/[id]` route only.
- UI components trust the server-side adapter/core output and must not re-derive tenant, branch,
  assignment, or subject visibility client-side.

## Entrypoint And Routing Contract

Authorized entrypoints for CRM28:

- Existing `/agent/crm` page/core flow.
- A focused app-side read adapter for the agent task queue.
- Existing CRM26 task server-action/core functions only if the implementation needs to reuse read
  behavior already exposed there. CRM28 should not add mutation UI.
- Focused test-only fixture helpers.

Unauthorized entrypoints:

- New `app/api/**/route.ts` HTTP route handlers.
- New `app/api/cron/crm/**/route.ts` cron route handlers.
- New route groups, route aliases, middleware, proxy edits, or canonical route rewrites.
- New `/member`, `/staff`, or `/admin` task UI or action surfaces.
- New assistance runtime UI or assistance-to-CRM execution surface.

`apps/web/src/proxy.ts` must remain untouched.

## Domain Coupling Boundary

- `packages/domain-crm/src/tasks/*` may define pure read-model contracts and sorting helpers.
- `packages/domain-crm/src/tasks/*` must not import from app code, database code, route code,
  `packages/domain-crm/src/leads/*`, `packages/domain-crm/src/lead-activities/*`, or assistance
  packages.
- App-side adapters may compose database rows into queue DTO inputs, but must not move SQL,
  session, route, localization, or rendering concerns into `domain-crm`.
- UI components under `apps/web/src/components/**` or route-local component files must not import
  `packages/domain-crm/src/tasks/*` directly. They receive queue DTOs from the `/agent/crm`
  `_core.ts` server function or a narrow app-side read adapter.
- CRM28 must not reintroduce legacy `crm_activities` follow-up writes or make the work queue depend
  on legacy activity records.
- Existing dashboard compatibility for legacy due follow-ups may remain, but the new CRM task queue
  should be task-backed and should not use legacy rows as task records.

## PII And Privacy Boundary

CRM task queue rows are operational work metadata, not a place for raw customer or case content.

Allowed queue data:

- task id;
- lead subject id;
- PII-safe lead display reference already authorized for the agent CRM page;
- status, priority, and reason codes;
- due date and timestamps;
- lifecycle version;
- stable localized label code;
- canonical lead route target.

Blocked queue data:

- lead notes, emails, phone numbers, member messages, support-handoff bodies, public responses,
  insurer correspondence, claim narratives, medical facts, legal strategy, assistance summaries,
  document text, AI summaries, or legacy follow-up free text;
- raw user-authored task titles or descriptions, unless a later gate explicitly adds a task-label
  contract;
- PII in idempotency keys, route params beyond existing lead id usage, telemetry names, audit
  metadata, logs, or test snapshots.

No AI behavior is introduced. CRM28 must not add model calls, prompts, embeddings, AI scoring, AI
routing, summarization, extraction, or agentic/tool-using behavior.

## UI Contract

CRM28 is a bounded UI foundation, not a redesign.

- The existing `/agent/crm` route, layout, and `agent-crm-page-ready` clarity marker must remain.
- The queue panel should introduce a stable test id such as `agent-crm-task-queue-ready` for
  targeted proof, without renaming existing clarity markers.
- The task queue should be placed within the existing agent CRM page structure, with compact
  operational styling consistent with the current CRM dashboard.
- The queue must have a deterministic empty state that does not imply hidden tasks exist.
- Labels must be localized through existing message files for the active app locales (`sq`, `en`,
  `sr`, and `mk`); domain code must emit stable codes, not localized strings.
- Links must target existing canonical lead detail routes. Unsupported subject kinds should not
  render broken links.
- The existing due follow-up list and lead-detail next-action surfaces must continue to work.
- The implementation should add or preserve test IDs only where needed for gate proof; it must not
  rename existing clarity markers.
- Accessibility baseline: rows must be keyboard navigable, Enter should activate the lead link when
  the row pattern supports row activation, due bucket/status must have screen-reader-usable text,
  and the compact layout must remain usable on mobile and dense desktop viewports. WCAG 2.1 AA is
  the review floor.

## Audit And Rate-Limit Contract

CRM28 is a read-only page extension. It introduces no new audit events, no mutation audit metadata,
and no new rate-limit rules. Queue reads inherit the existing `/agent/crm` page access posture.

The queue must not add logs or telemetry containing task, lead, member, case, assistance, or
document content. If the read adapter fails transiently, user-facing copy may show a distinct
non-PII error state; authorization, tenant, branch, assignment, and subject-visibility denials must
collapse to an empty/unavailable state that does not reveal whether hidden work exists.

## Side-Effect Contract

CRM28 is read-only from the user's point of view.

It must not add:

- task create, assign, start, complete, cancel, reopen, or due-date mutation controls;
- task scheduler or cron work;
- reminder fanout;
- email, SMS, WhatsApp, push notification, analytics, or outbox events;
- support-handoff, claim, assistance, agreement, POA, assignment, billing, or third-party
  submission records;
- database schema, migration, RLS, or historical backfill;
- task title/description/content persistence.

Revalidation behavior remains owned by existing mutation slices. CRM28 should not introduce new
write-side revalidation behavior.

## Fail-Closed Rules

CRM28 must fail closed when:

- no authenticated agent session is available;
- tenant, actor, role, or branch scope cannot be derived from trusted session context;
- the task is cross-tenant, cross-branch, unassigned, completed, cancelled, unsupported, or
  subject-invisible;
- the task subject is not `lead`;
- the read adapter cannot validate subject visibility;
- the read adapter would need to ask UI/client code to re-check tenant, branch, assignment, or
  subject visibility;
- rendering would require raw lead notes, free-text follow-up subject, case narrative, medical
  facts, legal strategy, insurer correspondence, assistance summaries, document text, or AI output;
- a queue row would need a new route, route alias, proxy edit, or unsupported subject link;
- implementation would require a mutation control, scheduler, notification, outbox, schema/RLS,
  auth, tenancy, routing, or architecture change.

Fail-closed UI for visibility and authorization denials must use a generic unavailable/empty state
and must not distinguish absent from invisible work items. Transient repository failures may render
a distinct generic error pane if it does not reveal task existence or hidden counts.

## Non-Goals

- Staff/admin/member task queues or task-management surfaces.
- Task create, assign, start, complete, cancel, reopen, due-date update, bulk action, or inline
  edit UI.
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

- `P40-CRM27` is recorded as completed in `current-program.md` and `current-tracker.md`.
- DG05 promotes only `P40-CRM28 Agent CRM Task Work Queue UI Foundation`.
- CRM28 adds a read-only agent CRM task queue to the existing `/agent/crm` route.
- The queue surfaces only visible, assigned, open, lead-backed CRM tasks.
- Non-lead task subjects remain hidden until separate subject-specific UI contracts are promoted.
- Queue DTOs are structural and PII-safe; raw lead/follow-up/case/user-authored content is not
  copied into labels, keys, snapshots, logs, telemetry, or DOM text.
- Lead display uses a PII-safe projection from an already authorized lead-summary read path, not raw
  lead notes, contact details, case narratives, or free-text follow-up subjects.
- Ordering is deterministic by due bucket/time, priority, and task id.
- Page-size is pinned to 10 rows for CRM28.
- Existing due follow-up and lead-detail next-action behavior remains stable.
- The new queue is task-backed only; the existing due-follow-up union read continues separately.
- Existing canonical routes and clarity markers remain unchanged.
- Stable queue labels are present across all active app locales.
- Focused tests cover queue derivation, app-side read scoping, deterministic ordering, empty state,
  PII-safe DTO/rendering behavior, keyboard/link behavior, and targeted agent CRM gate behavior.
- No task mutations, staff/admin/member task UI, new routes, scheduler, notification, outbox,
  assistance execution, database migration/RLS, proxy, auth, tenancy, Stripe, README, AGENTS, or
  broad architecture-doc change is included.

## Implementation Review Plan

The CRM28 implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: no caller-supplied authority, no raw PII/case content in queue material, absent
  vs. invisible copy remains indistinguishable, and no assistance/privacy cross-domain execution.
- Platform/runtime: session-derived actor context, branch/tenant scoping, read-adapter performance,
  deterministic ordering, and no route/proxy/auth/tenancy/schema changes.
- Domain boundary: queue contracts remain pure `domain-crm` read models, while SQL/session/rendering
  stay in app-side code.
- Product/workflow: the queue is a bounded foundation on `/agent/crm`; it does not introduce broad
  task management, scheduler, notifications, templates, sequences, or assistance execution.
- QA/accessibility: existing gate behavior stays green, empty/loading states are usable, link
  targets are stable, keyboard/screen-reader behavior is covered, and existing clarity markers
  remain intact.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: a "work queue" can become broad task management. CRM28 must remain read-only and
  agent-scoped.
- High: task labels can leak raw follow-up or lead content if the implementation invents title
  fields. The first queue must use stable localized label codes only.
- High: cross-branch/cross-agent task leakage would be user-visible. Adapter tests need explicit
  denial fixtures.
- Medium: the queue may appear sparse because only the lead follow-up workflow currently produces
  lead-backed CRM tasks. This is acceptable for a foundation slice.
- Medium: non-lead task subjects exist in the domain but should not render in CRM28 without
  subject-specific route and visibility contracts.
- Medium: query ordering can drift between domain derivation and SQL ordering. The implementation
  should test both if sorting is split.
- Medium: the existing due follow-up list and the new task queue can feel duplicative. The first
  version should preserve both, keep the queue task-backed only, and avoid double-counting/copy
  confusion.
- Medium: lead display references are necessary for usability but can leak contact or case content
  if sourced from the wrong read model. CRM28 must use an already authorized lead-summary projection
  and keep contact details, notes, and narratives out of the queue DTO.

Rollback path: CRM28 should add no schema, route, proxy, cron, notification, mutation, or
historical backfill. If queue behavior is wrong, rollback is a normal revert PR of queue
read-model, adapter, page, message, and focused test changes, leaving CRM27 migrated follow-up
behavior and CRM task persistence intact.

## Approval Bar

Approve DG05 only if:

- `P40-CRM27` predecessor proof is accepted as complete.
- Only `P40-CRM28 Agent CRM Task Work Queue UI Foundation` is promoted.
- The promoted slice is read-only, agent-scoped, lead-backed, and rendered on the existing
  `/agent/crm` route.
- Staff/admin/member task UI, mutation controls, scheduler/cron, reminders, notifications, outbox,
  templates, sequences, scoring, assistance-intent execution, database migrations/RLS, historical
  backfill, route/proxy/auth/tenancy changes, Stripe, README, AGENTS, and broad architecture-doc
  changes remain blocked.
- PII-safe structural queue DTOs, subject visibility, deterministic ordering, and clarity-marker
  preservation are accepted as implementation requirements.
- The RSC/server `_core.ts` read pattern, task-only queue read, PII-safe lead display projection,
  active app locale labels, 10-row page size, and accessibility baseline are accepted as
  implementation requirements.

## Verification

Design-gate PR verification should include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs-only delta

Implementation proof for `P40-CRM28` should include:

- focused unit tests for queue derivation and deterministic sorting;
- focused app-side adapter tests for tenant, branch, assignment, status, and subject visibility;
- focused UI/core tests for queue rendering, empty state, lead links, and no raw PII labels;
- focused tests proving queue labels resolve in `sq`, `en`, `sr`, and `mk`;
- focused accessibility proof for keyboard navigation, screen-reader status/due text, and mobile or
  dense-layout behavior;
- targeted preservation proof for the existing due follow-up and lead-detail next-action flows;
- targeted update or preservation proof for `apps/web/e2e/gate/agent-crm-follow-up.spec.ts`;
- `pnpm --filter @interdomestik/domain-crm type-check`;
- `pnpm --filter @interdomestik/domain-crm test:unit`;
- `pnpm --filter @interdomestik/web type-check`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

No DB-side verification such as migration journal or RLS-table proof is required for CRM28 because
this gate does not propose database schema, migration, RLS, or historical backfill changes.

## Completion State

The status column reflects the intended state after the approved DG05 PR merges.

| Item                                                     | Status    | Decision                                                                           |
| -------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `P40-CRM27 Agent Lead Follow-Up To CRM Task Migration`   | completed | Merged through PR `#837`, merge commit `5421a09b29624492dc54476ec3585cc7a06df20e`. |
| `P40-DG05 CRM Task Work Queue UI Foundation Design Gate` | completed | This gate promotes the next bounded implementation slice.                          |
| `P40-CRM28 Agent CRM Task Work Queue UI Foundation`      | pending   | Promoted read-only agent task queue foundation on the existing CRM page.           |
| Later P40 scheduler/notification/template/sequence work  | reserved  | No implementation authority from this design gate.                                 |
