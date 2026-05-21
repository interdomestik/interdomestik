# P40-DG03 CRM Task Runtime Boundary Design Gate

Status: complete
Slice: `P40-DG03`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-21
Authority: repo-canonical design gate. This gate closes
`P40-CRM25 CRM Task Persistence And Repository Adapter` after merge and promotes exactly one next
implementation slice.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                      |
| -------- | ---------- | ------------------------------------------------------------------------------------------ |
| `r1`     | 2026-05-21 | Initial review draft after `P40-CRM25` task persistence adapter merged.                    |
| `r2`     | 2026-05-21 | Review hardening for entrypoints, errors, audit, rate limits, and DTOs.                    |
| `r3`     | 2026-05-21 | Approved promotion to `P40-CRM26 CRM Task Application Service And Server Action Boundary`. |

## Definitions

- CRM task runtime boundary: the app-side service/action boundary that lets existing authenticated
  CRM surfaces request task mutations through the persisted `CrmTaskRepository` without exposing
  database rows or domain internals directly to UI components.
- Application service: a small orchestration layer that resolves actor/session context, validates
  request shape, calls existing pure task mutations, persists the result through
  `createCrmTaskRepository`, and returns a typed, PII-safe result.
- Server action boundary: a Next.js server action or `.core.ts` action entry point that can later be
  consumed by UI, while keeping authentication, tenant context, idempotency, and revalidation rules
  centralized.
- Runtime UI: rendered task lists, task buttons, panels, filters, badges, counters, or interaction
  controls on `/agent`, `/staff`, `/admin`, or `/member` surfaces. Runtime UI is not promoted here.
- Lifecycle version: the `CrmTask.lifecycleVersion` compare-and-set guard added by `P40-CRM25` and
  required for state-changing task updates.
- Idempotent replay: a repeated mutation request with the same idempotency key and equivalent
  material returning the already-persisted task result rather than writing duplicate task or history
  rows.
- PII-safe task DTO: a returned task shape that includes structural ids, kind/status/priority,
  timestamps, assignment shape, and reason codes, but never copies lead notes, member message text,
  support-handoff bodies, emails, phone numbers, insurer correspondence, medical facts, or legal
  strategy.
- Assistance intent execution: turning `domain-assistance` workflow intents into CRM side effects.
  This remains blocked; P39 intent output is advisory and uses `executionAllowed: false`.

## Predecessor Dependency

`P40-CRM25 CRM Task Persistence And Repository Adapter` is the direct predecessor for this gate.

Predecessor proof:

- `P40-DG02 CRM Task Persistence And Repository Adapter Design Gate` is recorded in
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`.
- `P40-CRM25` merged as PR `#833`, merge commit
  `0c941890e2f2f2ae1f9460879a6857a42e374161`, on 2026-05-21.
- PR `#833` added additive `crm_tasks` and `crm_task_history` persistence, tenant RLS, database
  schema exports, app-side `createCrmTaskRepository`, lifecycle-version compare-and-set writes,
  idempotent create replay, subject visibility proof for `lead`, `deal`, and `support_handoff`,
  fail-closed `account` and `contact` subject handling, and focused adapter/RLS tests.
- Before this DG03 PR, the repository tracker still showed `P40-CRM25` as pending. This approved
  DG03 PR corrects that closeout state before promoting the next implementation slice.

This gate must not reinterpret CRM task runtime as task-state recovery, paused workflow resume,
lead-follow-up migration, scheduler retry replay, notification fanout, or assistance-intent
execution.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior gates:
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md` and
  `docs/plans/2026-05-20-p40-dg02-crm-task-persistence-design.md`.
- Task domain contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, and
  `packages/domain-crm/src/tasks/index.test.ts`.
- Task persistence adapter: `apps/web/src/adapters/crm/task-repository.ts` and
  `apps/web/src/adapters/crm/task-repository.test.ts`.
- Application-service precedent:
  `packages/domain-crm/src/routing/application-service.ts`,
  `packages/domain-crm/src/routing/application-service.test.ts`,
  `apps/web/src/adapters/crm/routing-application-service.ts`, and
  `apps/web/src/adapters/crm/routing-application-service.test.ts`.
- Existing server-action/core precedent: `apps/web/src/actions/agent-crm-follow-up.core.ts`,
  `apps/web/src/actions/agent-crm-follow-up.ts`, and
  `apps/web/src/actions/support-handoffs/*.core.ts`.
- Existing session helpers: `auth.api.getSession({ headers: await headers() })` from
  `apps/web/src/lib/auth.ts` and `ensureTenantId(session)` from `@interdomestik/shared-auth`.
- Existing audit and rate-limit helpers: `logAuditEvent` from `apps/web/src/lib/audit.ts` and
  `enforceRateLimitForAction` from `apps/web/src/lib/rate-limit.ts`.
- Existing CRM surfaces that may later consume this boundary:
  `apps/web/src/app/[locale]/(agent)/agent/crm/_core.ts`,
  `apps/web/src/app/[locale]/(staff)/staff/crm/_core.ts`, and
  `apps/web/src/app/[locale]/admin/crm/_core.ts`.

## Decision

Promote exactly one implementation slice:

`P40-CRM26 CRM Task Application Service And Server Action Boundary`

The promoted slice creates the narrow runtime boundary between existing authenticated CRM surfaces
and the persisted CRM task aggregate. It should compose the pure `domain-crm` task mutation helpers
with the CRM25 `createCrmTaskRepository` adapter, normalize typed request/response envelopes, and
centralize authorization, idempotency, lifecycle-version, and PII-safe output behavior before any
rendered task UI, scheduler, notification, template, sequence, scoring, or assistance execution is
considered.

The slice may add internal application-service and server-action entry points, but it must not add
runtime UI. No user-facing page may start displaying task lists, counters, controls, or action
buttons from this gate.

## Candidate Ranking

| Rank | Candidate                                                           | Decision | Rationale                                                                                                      |
| ---- | ------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM26 CRM Task Application Service And Server Action Boundary` | Promote  | Persistence is complete; a reusable runtime boundary is the next dependency before task UI can safely call it. |
| 2    | Agent/staff/admin CRM task UI                                       | Defer    | UI should consume a centralized service/action boundary, not call repository methods directly.                 |
| 3    | Due-task scheduler and reminders                                    | Defer    | Scheduler fanout needs runtime semantics plus notification, retry, and audit design.                           |
| 4    | Lead follow-up migration into CRM tasks                             | Defer    | Existing follow-ups are backed by `crm_activities`; migration needs coexistence and backfill design.           |
| 5    | CRM task templates or sequences                                     | Defer    | Templates and sequences depend on service boundaries plus scheduler/notification semantics.                    |
| 6    | Assistance intent execution into CRM tasks                          | Reject   | P39 assistance workflow intents remain advisory and `executionAllowed: false`.                                 |

## Promoted Slice Scope

Authorized implementation scope for `P40-CRM26`:

- Add a task application-service boundary in the app/runtime layer, following existing
  routing-application-service and server-action/core patterns.
- Reuse `createCrmTaskRepository`; do not fork or bypass the CRM25 adapter.
- Reuse existing pure task mutation helpers: `createCrmTask`, `assignCrmTask`,
  `updateCrmTaskDueAt`, `startCrmTask`, `completeCrmTask`, `cancelCrmTask`, and `reopenCrmTask`.
- Add typed request and response envelopes for create, assign, due-date update, start, complete,
  cancel, reopen, and read-by-id operations.
- Resolve `CrmActorContext` from existing authenticated session helpers; do not accept caller-sent
  tenant, branch, role, or actor authority as trusted authorization state.
- Require `taskId` plus `expectedLifecycleVersion` for state-changing mutations after create.
- Require explicit idempotency keys for create and other retryable mutation requests where the
  boundary can safely define equivalent material.
- Convert expected repository failures into typed action/service results, not generic thrown errors.
- Return PII-safe task DTOs that expose structural task information only.
- Keep route revalidation scoped to existing CRM surfaces when a mutation succeeds. Revalidation
  must not create new routes or bypass canonical routes.
- Add focused unit tests for successful create/update flows, missing auth, tenant/branch denial,
  unsupported subject handling, stale lifecycle version, idempotent replay, repository failure
  mapping, and PII-safe output.

Expected implementation delta should stay focused on:

- `apps/web/src/actions/crm-tasks*.ts` or an equivalent existing action/core location;
- `apps/web/src/adapters/crm/*` only when small composition helpers are needed;
- `packages/domain-crm/src/tasks/*` only if a narrow public type/export is required for service
  composition and the implementation PR justifies it;
- focused action/service tests and fixture helpers.

Any rendered UI, route, scheduler, notification, outbox, template, sequence, scoring,
assistance-adapter, migration, RLS, proxy, auth architecture, or tenancy architecture change
requires a later gate.

## Entrypoint Contract

Authorized entrypoints:

- Internal `.core.ts` application-service functions under the existing `apps/web/src/actions`
  pattern.
- Server-action wrapper files that call those core functions from existing authenticated UI
  surfaces in a later UI slice.
- Focused test-only helpers that exercise the core/service boundary without rendering runtime UI.

Explicitly unauthorized entrypoints:

- New `app/api/**/route.ts` HTTP route handlers.
- New `app/api/cron/crm/**/route.ts` cron route handlers, including any
  `app/api/cron/crm/tasks/route.ts` due-task endpoint.
- New route groups, middleware, proxy behavior, canonical route aliases, or route rewrites.
- New client components, rendered task panels, task buttons, counters, filters, badges, or list
  views.

The cron pattern using `Authorization: Bearer $CRON_SECRET` and `enforceRateLimit` remains reserved
for a later scheduler/reminder gate. CRM26 must not introduce cron auth, cron rate limits, scheduled
task reads, or scheduled task mutations.

## Runtime Boundary Contract

The service/action boundary must expose deterministic typed results using a discriminated-union
shape aligned with the existing routing application-service precedent:
`{ outcome: '<category>', ... }`. Each operation must resolve to one of these outcome categories:

- `success`: mutation persisted or task found, with a PII-safe task DTO.
- `idempotent_replay`: equivalent prior request returned the existing task, with no duplicate
  history append.
- `not_found`: task or supported subject is absent after scoped lookup.
- `forbidden`: actor/session is absent, tenant-scoped authorization fails, or branch-scoped
  visibility fails.
- `conflict`: lifecycle version is stale or idempotency material differs.
- `invalid_input`: structural ids, timestamps, priority/status/reason codes, assignment target, or
  idempotency key are malformed.
- `repository_failure`: unexpected adapter/database failure after expected denials are handled.

The boundary must not expose raw `CrmTaskRepositoryFailure` instances to callers. It should map
known reasons to stable result codes:

- `idempotency_conflict` -> `conflict`
- `lifecycle_conflict` -> `conflict`
- `subject_not_found` -> `not_found`
- `subject_not_visible` -> `forbidden`
- `subject_proof_missing` -> `forbidden`

The boundary must also map pure `CrmTaskMutationDenialReason` values consistently:

| Domain denial reason                                        | Boundary outcome |
| ----------------------------------------------------------- | ---------------- |
| `actor_scope`, `role_scope`, `tenant_scope`, `branch_scope` | `forbidden`      |
| `assignment_scope`                                          | `forbidden`      |
| `subject_not_visible`, `subject_proof_missing`              | `forbidden`      |
| `subject_not_found`                                         | `not_found`      |
| `terminal_state`, `unsupported_transition`                  | `conflict`       |
| `duplicate_idempotency_conflict`                            | `conflict`       |
| `non_monotonic_timestamp`                                   | `invalid_input`  |
| any `invalid_*` denial reason                               | `invalid_input`  |

No implementation PR may introduce a parallel result-envelope convention without calling it out as
a contract change in the PR description.

## Operation Contract

Create task:

- Inputs must include subject reference, assignment target, priority, optional due date, create
  reason code, and idempotency key.
- The boundary must call repository `validateSubjectReference` before `createCrmTask`.
- The resulting `subjectProof` must be the only source of task branch inheritance.
- Account/contact subjects must fail closed until a later account/contact persistence gate exists.

Read task:

- Inputs must include `taskId`.
- The boundary must use repository `findTaskById` and return `not_found` for invisible or absent
  tasks without distinguishing those states to the UI caller.
- If the task row exists but the source subject row has disappeared, the repository hydration path
  must still return `null`; the boundary maps that orphaned-subject case to `not_found`.

State mutations:

- Inputs must include `taskId`, `expectedLifecycleVersion`, a valid reason code, and an idempotency
  key where retryable mutation semantics are implemented.
- The boundary must re-read the visible task before applying the pure mutation helper.
- The boundary must persist the mutation with the caller's expected lifecycle version.
- A stale version must return `conflict` and must not append task history.

Assignment and due-date mutations:

- Assignment targets must remain structural and must not include display names, emails, phone
  numbers, notes, or free text.
- Due-date inputs must normalize to ISO timestamps or null before reaching the domain helper.

Idempotency:

- Create operations must require a caller-provided idempotency key and use CRM25 repository replay.
- State-changing update operations must not accept weak or ad hoc client-generated replay semantics.
  CRM26 must either derive a deterministic idempotency key from actor, task id, expected lifecycle
  version, operation kind, normalized reason code, normalized timestamp or due date, and assignment
  target where applicable, or explicitly mark that operation as non-idempotent in the service
  contract.
- Browser double-submit, React repeated invocation, and HTTP retries must resolve to the same
  idempotency rule for the operation; the implementation PR must test at least one duplicate-submit
  path.

## Authorization And Session Contract

The implementation must use existing session/auth helpers to construct `CrmActorContext`:
`auth.api.getSession({ headers: await headers() })` from `apps/web/src/lib/auth.ts`, followed by
`ensureTenantId(session)` from `@interdomestik/shared-auth`, matching existing action/core
precedent.

Required behavior:

- Missing session fails closed as `forbidden`.
- Actor tenant must come only from the trusted session boundary.
- Non-admin actors remain branch-scoped according to existing `CrmActorContext.scope.branchId`
  semantics.
- `agent`, `staff`, and `branch_manager` actors fall under the same branch fence; only `admin` is
  tenant-wide.
- Admin actors remain tenant-wide but still tenant-scoped.
- The boundary must not introduce new auth roles, new tenant headers, proxy changes, or route
  bypasses.
- Tests must prove a caller cannot override tenant, branch, role, or actor id through request
  payload fields.

## Domain Coupling Boundary

- `packages/domain-crm/src/tasks/*` must remain pure and must not import `apps/web`,
  `@interdomestik/database`, `@interdomestik/domain-assistance`, or
  `@interdomestik/domain-privacy`.
- The app/runtime boundary may import `@interdomestik/domain-crm/tasks`, the CRM25 task repository
  adapter, existing auth/session helpers, existing audit/rate-limit helpers, and existing
  revalidation utilities.
- CRM26 must not add new imports from task code into database, web, claims, assistance, privacy,
  billing, scheduler, notification, or AI packages.

## PII And Privacy Boundary

- Service/action outputs may return `CrmTask` from `@interdomestik/domain-crm/tasks` unchanged
  because that type is already structural, or a narrower DTO with the same structural-only
  guarantee. If the implementation strips fields such as `idempotencyKey`, it must define the DTO
  type explicitly and test the projection.
- Outputs may include task id, subject kind/id, status, priority, due date, assignment kind, reason
  codes, timestamps, lifecycle version, and structural branch/actor ids.
- Outputs must not include lead names, company names, emails, phone numbers, lead notes,
  support-handoff message bodies, public responses, member replies, insurer correspondence, claim
  narratives, medical facts, legal strategy, assistance summaries, or document text.
- Task creation must not imply consent, Professional Recovery authorization, POA, assignment,
  success-fee agreement, third-party communication authority, or submission authority.
- CRM26 must not import `@interdomestik/domain-assistance` or
  `@interdomestik/domain-privacy`.
- No AI behavior is introduced. CRM26 must not add model calls, prompts, embeddings, AI scoring,
  AI routing, summarization, extraction, or agentic/tool-using behavior.

## Audit Contract

Every successful task mutation and every idempotent replay must call the existing `logAuditEvent`
helper. Audit events must be tenant-scoped and actor-scoped from the trusted session context.

Expected audit shape:

- `entityType`: `crm_task`.
- `entityId`: the task id.
- `action`: stable `crm.task.<event>` code such as `crm.task.created`, `crm.task.assigned`,
  `crm.task.due_updated`, `crm.task.started`, `crm.task.completed`, `crm.task.cancelled`, or
  `crm.task.reopened`.
- `metadata`: structural operation kind, task status transition, reason code, subject kind, and
  `replay: true` for idempotent replay.

Audit metadata must not copy subject narratives, lead notes, support-handoff bodies, public
responses, member replies, emails, phone numbers, insurer correspondence, claim narratives, medical
facts, legal strategy, assistance summaries, or document text.

## Rate-Limit Contract

CRM task mutation server actions must use the existing `enforceRateLimitForAction` helper before
performing persistence. The implementation PR must choose a small authenticated-write budget aligned
with comparable CRM/support mutation actions and document the chosen name, limit, and window in the
tests or PR description.

Read-by-id helpers may use existing page/session protections without a new per-action rate limit
unless the implementation exposes a direct server action callable from client components. New HTTP
or cron route-level rate limits are not authorized because new HTTP and cron routes are not
authorized by this gate.

## Revalidation And Side-Effect Contract

The boundary may revalidate existing CRM routes only after successful mutations. Revalidation must
be narrow and deterministic:

- Existing `/agent/crm`, `/staff/crm`, and `/admin/crm` surfaces may be listed as future consumers,
  but this slice must not render new task UI on them.
- Revalidation must follow the existing locale loop pattern over `LOCALES` for canonical localized
  paths. It must not revalidate only one locale unless the implementation PR proves the path is
  locale-independent.
- No new routes, route groups, middleware/proxy behavior, or canonical route aliases may be added.
- No outbox events, emails, SMS, WhatsApp messages, push notifications, scheduler work items, queue
  jobs, or analytics events may be emitted.
- No lead follow-up row, support-handoff row, claim row, assistance row, or external record may be
  created by CRM26.

## Fail-Closed Rules

CRM task runtime boundary must fail closed when:

- session or actor context is missing, malformed, or unsupported;
- request payload attempts to provide trusted tenant, branch, role, or actor authority;
- task id, subject id, assignment target, timestamp, reason code, priority, or idempotency key is
  malformed;
- subject visibility proof is missing, unsupported, not found, not tenant-scoped, or not visible to
  the actor branch;
- account/contact task runtime access is requested before durable account/contact subject support
  exists;
- requested task is not visible to the actor tenant and branch scope;
- state mutation lacks `expectedLifecycleVersion`;
- state mutation uses a stale lifecycle version;
- idempotency key replay points at non-equivalent material;
- repository failure would otherwise leak database details to a UI caller;
- output would require copying raw subject narrative or sensitive content;
- mutation would imply scheduler, notification, assistance, claim, support-handoff, Professional
  Recovery, agreement, POA, or third-party-submission authority.

## Non-Goals

- Runtime task UI on `/agent`, `/staff`, `/admin`, `/member`, `/agent/crm`, lead detail, support
  handoff, deal, account, or contact surfaces.
- New routes, API endpoints, route groups, canonical route aliases, or proxy edits.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push,
  analytics, or outbox emission.
- CRM templates, sequences, scoring, campaign automation, consent/preference implementation, or
  automated routing triggers.
- Lead follow-up migration from `crm_activities` to `crm_tasks`.
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

- `P40-CRM25` is recorded as completed in `current-program.md` and `current-tracker.md` by the
  approved design-gate PR.
- `P40-DG03` promotes only `P40-CRM26 CRM Task Application Service And Server Action Boundary`.
- CRM26 adds a reusable service/action boundary over the existing `createCrmTaskRepository`.
- CRM26 authorizes only `.core.ts`/server-action entrypoints and explicitly does not add HTTP or
  cron route handlers.
- CRM26 does not bypass the CRM25 repository adapter or write task tables directly.
- CRM26 reuses existing pure `domain-crm` task mutation helpers.
- Trusted tenant, branch, role, and actor context come from existing session helpers only.
- State-changing mutations require `expectedLifecycleVersion`; stale versions return typed
  conflicts and do not append history.
- Idempotent replay behavior is deterministic for supported create/update operations.
- Unsupported or invisible subjects fail closed without leaking visibility details to UI callers.
- Returned DTOs are PII-safe and structural only.
- Successful mutations and idempotent replay paths write PII-safe audit events.
- Mutation actions use the existing `enforceRateLimitForAction` helper pattern.
- No runtime UI, route, scheduler, notification, outbox, AI, assistance execution, database
  migration, proxy, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc change is
  included.

## Implementation Review Plan

Because CRM26 creates the first runtime boundary for persisted CRM tasks, the implementation PR must
include independent review evidence before merge. Reviewer areas:

- Security/privacy: session-derived actor context, tenant/branch denial, no caller-supplied
  authority, PII-safe output and audit metadata, no consent inference, and no assistance/privacy
  cross-domain imports.
- Platform/runtime: server-action/core shape, repository composition, typed failure mapping,
  idempotency behavior, rate-limit placement, revalidation discipline, and no route/proxy/auth/
  tenancy changes.
- Domain boundary: pure task helpers remain the source of state-transition truth; the app boundary
  does not duplicate or reinterpret task state rules.
- Product/workflow: runtime boundary does not silently create UI, scheduler, notification, lead
  follow-up migration, or assistance execution behavior.
- QA/gates: focused tests prove success, auth denial, branch denial, unsupported subject denial,
  stale lifecycle conflict, idempotent replay, repository failure mapping, audit/rate-limit
  behavior, no HTTP/cron entrypoint addition, and PII-safe DTOs.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: a server-action boundary can accidentally become user-facing workflow authority before UI
  copy, accessibility, and task ownership semantics are reviewed. CRM26 must stay non-rendering.
- High: callers might bypass the repository adapter and write task tables directly. CRM26 must route
  all task persistence through `createCrmTaskRepository`.
- High: lead follow-ups already persist as `crm_activities`; CRM26 must not migrate, double-write,
  or reinterpret those rows as CRM tasks.
- High: assistance workflow intents remain advisory. CRM26 must not execute assistance intents into
  CRM side effects.
- Medium: exact server-action file placement should follow the app's existing `.core.ts` patterns
  during implementation.
- Medium: idempotency for update operations may need narrower support than create. If an update
  cannot safely define equivalent material, the implementation PR must document that operation as
  non-idempotent rather than inventing weak replay semantics.
- Medium: account/contact subjects are contract-valid but still fail closed until a later
  persistence and subject-visibility slice exists.
- Medium: route revalidation can become broad and expensive. CRM26 should revalidate only existing
  CRM paths that will later consume task state.
- Medium: the routing application-service result envelope is a precedent to imitate, not fork.
  Divergent envelope shapes should be treated as a contract-change risk.
- Low: future task UI may need cached/RSC-friendly read helpers. CRM26 may expose read-by-id only;
  broader list/read-model caching should remain a later UI/read-surface decision.

Rollback path: CRM26 should add no schema, route, proxy, or rendered UI. If runtime-boundary behavior
is wrong, rollback is a normal revert PR of service/action files and focused tests, leaving CRM25
persistence intact and unused by UI.

## Approval Bar

Approve DG03 only if:

- `P40-CRM25` predecessor proof is accepted as complete.
- The tracker/program closeout gap for PR `#833` is explicitly corrected in the approved PR.
- Only `P40-CRM26 CRM Task Application Service And Server Action Boundary` is promoted.
- The promoted slice is limited to service/action boundary code, repository composition, typed
  request/response envelopes, session-derived actor context, lifecycle-version/idempotency proof,
  audit/rate-limit proof, PII-safe DTOs, and focused tests.
- Runtime UI, routes, scheduler, notifications, templates, sequences, scoring, lead-follow-up
  migration, assistance execution, database migrations/RLS, proxy/canonical route/auth/tenancy
  changes, Stripe, README, AGENTS, and broad architecture-doc changes remain blocked.

## Verification

Design-gate PR verification should include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs-only delta

Implementation proof for `P40-CRM26` should include:

- focused CRM task service/action tests;
- focused PII-safe DTO tests;
- focused stale lifecycle-version and idempotency replay tests;
- focused audit and action-rate-limit tests;
- focused no-HTTP-route and no-cron-route scope proof;
- `pnpm --filter @interdomestik/domain-crm type-check`;
- `pnpm --filter @interdomestik/domain-crm test:unit`;
- `pnpm --filter @interdomestik/web type-check`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

No DB-side verification such as migration journal or RLS-table proof is required for CRM26 because
this gate does not authorize database schema, migration, or RLS changes.

## Completion State

The status column reflects the intended state after the approved DG03 PR merges.

| Item                                                                | Status    | Decision                                                        |
| ------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| `P40-CRM25 CRM Task Persistence And Repository Adapter`             | completed | Merged through PR `#833`, merge commit `0c941890`.              |
| `P40-DG03 CRM Task Runtime Boundary Design Gate`                    | completed | This gate promotes the next bounded runtime-boundary slice.     |
| `P40-CRM26 CRM Task Application Service And Server Action Boundary` | promoted  | Service/action boundary over the CRM25 task repository adapter. |
| Later P40 UI/scheduler/notification/template/sequence work          | reserved  | No implementation authority from this design gate.              |
