# P40-DG02 CRM Task Persistence And Repository Adapter Design Gate

Status: complete
Slice: `P40-DG02`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-20
Authority: repo-canonical design gate. This gate closes `P40-CRM24 CRM Task Domain Foundation`
and promotes exactly one next implementation slice.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                 |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-20 | Initial review draft after `P40-CRM24` task domain foundation merged.                                 |
| `r2`     | 2026-05-20 | Review hardening for lifecycle-version concurrency, DSR deferral, migration shape, and subject rules. |
| `r3`     | 2026-05-20 | Approved promotion to `P40-CRM25 CRM Task Persistence And Repository Adapter`.                        |

## Definitions

- CRM task persistence: durable storage and retrieval of the `packages/domain-crm/src/tasks`
  aggregate behind the existing `CrmTaskRepository` port. It is not UI, scheduling, automation, or
  task-state recovery.
- CRM task repository adapter: an app-side Drizzle adapter that maps stored task rows and task
  history rows to the pure `CrmTaskRepository` contract.
- Subject visibility proof: an adapter-owned check that the task subject exists, belongs to the
  same tenant, and is visible within the actor branch scope before a task is saved or returned.
- Task history row: an append-style transition record for one task mutation. It stores structural
  transition metadata only, not subject narrative or support-message content.
- Structural subject reference: `{ kind, id }`, where `kind` is one of the existing CRM task
  contract kinds: `lead`, `deal`, `account`, `contact`, and `support_handoff`.
- Durable subject kinds: the subject kinds with current database backing in this repo. In this
  draft they are `lead`, `deal`, and `support_handoff`.
- Unsupported durable subject kind: a contract-valid subject kind without a current table backing.
  In this draft `account` and `contact` remain contract-valid but adapter persistence must fail
  closed until a later account/contact persistence slice exists.
- Idempotent persistence: repeated create/save attempts with the same idempotency key and equivalent
  task material return the same stored task or typed conflict, without duplicate task or history
  rows.
- Lifecycle version: a monotonically increasing integer on `crm_tasks` used as the compare-and-set
  guard for task updates and history appends. It follows the existing support-handoff repository
  precedent of explicit expected-version writes.
- Equivalent task material: the canonical idempotency projection made from `tenantId`,
  `subjectReference`, `assignedTo`, `priority`, normalized `dueAt`, `createReasonCode`, and
  `createdBy`. Reusing an idempotency key with a different projection is a conflict.

## Predecessor Dependency

`P40-CRM24 CRM Task Domain Foundation` is the direct predecessor for this gate.

Predecessor proof:

- `P40-DG01 CRM Lane Resumption And Task Foundation Design Gate` is recorded in
  `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`.
- `P40-CRM24` is recorded as complete in `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- `P40-CRM24` is verified in git history as `d72fb1fa feat: add CRM task domain foundation
(#827)`.
- `packages/domain-crm/src/tasks` now exposes pure task contracts, state-transition helpers,
  mutation exports, repository ports, deterministic clock/ID injection, branch-scoped subject
  proof, PII-safe structural output, idempotency material, append-style history expectations, and
  focused tests.

This gate must not reinterpret `CRM lane resumption` as paused-task runtime resume, retry replay,
session rehydration, or task-state recovery.

## Source Inputs

- Current program and tracker: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- Prior gate: `docs/plans/2026-05-20-p40-dg01-crm-resume-task-foundation.md`.
- CRM roadmap and closeout:
  `docs/plans/2026-05-13-p38-crm-state-of-art-roadmap.md` and
  `docs/plans/2026-05-16-p38-dg22-crm23-foundation-closeout.md`.
- Task contracts: `packages/domain-crm/src/tasks/types.ts`,
  `packages/domain-crm/src/tasks/state.ts`, `packages/domain-crm/src/tasks/repository.ts`,
  `packages/domain-crm/src/tasks/mutations.ts`, `packages/domain-crm/src/tasks/index.ts`, and
  `packages/domain-crm/src/tasks/index.test.ts`.
- CRM repository-port patterns: `packages/domain-crm/src/leads/repository.ts`,
  `packages/domain-crm/src/deals/repository.ts`, and
  `packages/domain-crm/src/support-handoffs/repository.ts`.
- CRM schema sources: `packages/database/src/schema/crm.ts`,
  `packages/database/src/schema/rbac.ts`, `packages/database/drizzle/0064_crm_routing_persistence.sql`,
  and `packages/database/drizzle/0054_support_handoffs.sql`.
- Existing adapter patterns: `apps/web/src/adapters/crm/lead-follow-up-repository.ts`,
  `apps/web/src/adapters/crm/lead-activity-repository.ts`,
  `apps/web/src/adapters/crm/deal-repository.ts`, and
  `apps/web/src/adapters/crm/routing-repository.ts`.
- RLS and tenant isolation patterns: `packages/database/drizzle/0031_enable_claim_rls.sql`,
  `packages/database/drizzle/0054_support_handoffs.sql`, and
  `packages/database/drizzle/0064_crm_routing_persistence.sql`.

## Decision

Promote exactly one implementation slice:

`P40-CRM25 CRM Task Persistence And Repository Adapter`

The promoted slice persists the already-approved CRM task aggregate behind the existing
`CrmTaskRepository` port. It creates additive task and task-history storage, maps those rows through
an app-side Drizzle adapter, enforces tenant and branch visibility, and proves idempotent
append-style history behavior before any task UI, scheduler, notification, template, sequence, or
assistance-intent execution is considered.

The implementation must keep the domain package pure. Persistence lives in database schema,
migrations, and app-side adapters. The only authorized domain-package change is a narrow
concurrency contract extension: add task lifecycle-version metadata and expected-version repository
write parameters so the adapter cannot silently clobber concurrent transitions.

## Candidate Ranking

| Rank | Candidate                                               | Decision | Rationale                                                                                                   |
| ---- | ------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM25 CRM Task Persistence And Repository Adapter` | Promote  | Durable storage is the next dependency after task contracts and before any runtime task workflow can exist. |
| 2    | CRM task UI on agent/staff surfaces                     | Defer    | UI would create user workflow expectations before persistence, RLS, idempotency, and visibility are proven. |
| 3    | Due-task scheduler and notifications                    | Defer    | Scheduler fanout needs durable task state plus explicit failure, retry, notification, and audit semantics.  |
| 4    | CRM task templates or sequences                         | Defer    | Templates and sequences depend on persistence plus scheduler/notification contracts.                        |
| 5    | Lead follow-up migration into CRM tasks                 | Defer    | Existing follow-ups are backed by `crm_activities`; migration needs separate coexistence/backfill design.   |
| 6    | Assistance intent execution into CRM tasks              | Reject   | ASSIST intents are advisory and `executionAllowed: false`; execution requires a separate authority gate.    |

## Promoted Slice Scope

Authorized implementation scope for `P40-CRM25`:

- Add additive Drizzle schema and SQL migration for `crm_tasks` and `crm_task_history`.
- Export the new schema from the database package using existing schema organization.
- Enable RLS on both tables with tenant-isolation policies using the existing
  `app.current_tenant_id` pattern.
- Add app-side CRM task repository adapter under `apps/web/src/adapters/crm/`.
- Add a narrow pure-domain concurrency extension to `packages/domain-crm/src/tasks`: task
  `lifecycleVersion` and expected-version repository write parameters for `saveTask` and
  `appendTaskHistory`.
- Implement `CrmTaskRepository.saveTask`, `findTaskById`, `findTaskByIdempotencyKey`,
  `appendTaskHistory`, and `validateSubjectReference` behind the existing domain port.
- Persist and rehydrate the CRM task aggregate without widening the domain task contract.
- Persist append-style task history rows for domain transitions without raw subject text.
- Prove idempotency for duplicate task creation and equivalent retry behavior using
  `(tenant_id, idempotency_key)` uniqueness where `idempotency_key` is not null.
- Prove branch-scoped task reads and writes fail closed for branch-limited actors.
- Implement durable subject visibility proof for currently backed subject kinds:
  `lead`, `deal`, and `support_handoff`.
- Fail closed for `account` and `contact` subject visibility until durable account/contact tables
  are introduced by a later gate.
- Add focused unit/integration tests for adapter mapping, tenant/branch constraints, subject
  visibility, lifecycle-version conflicts, idempotency conflicts, append-only history, and PII-safe
  output.
- Update repo-size budget only if required by migration/schema/test growth.

Expected implementation delta should stay focused on:

- `packages/database/src/schema/crm.ts`
- `packages/database/drizzle/*`
- `packages/database/drizzle/meta/*`
- `packages/domain-crm/src/tasks/*` only for lifecycle-version repository contract updates
- `apps/web/src/adapters/crm/*`
- focused adapter/database tests
- package exports or budget files only as needed

Any UI, route, server action, scheduler, notification, outbox, template, sequence, scoring,
assistance-adapter, or claim/support-handoff creation work requires a later gate.

## Persistence Contract

`crm_tasks` should minimally store:

- `id`: task id, primary key.
- `tenant_id`: required tenant id.
- `branch_id`: nullable branch snapshot derived from subject proof.
- `subject_kind`: required task subject kind.
- `subject_id`: required subject id.
- `assigned_kind`: `unassigned`, `actor`, `role`, or `team`.
- `assigned_actor_id`: nullable actor assignment target.
- `assigned_role`: nullable role assignment target.
- `assigned_team_id`: nullable team assignment target.
- `assigned_branch_id`: nullable assignment branch snapshot.
- `assigned_tenant_id`: nullable assignment tenant snapshot.
- `status`: `pending`, `in_progress`, `completed`, or `cancelled`.
- `priority`: `low`, `normal`, `high`, or `urgent`.
- `due_at`: nullable timestamp with time zone.
- `idempotency_key`: nullable stable retry key.
- `lifecycle_version`: required integer starting at `1` for created tasks and incremented by exactly
  one for every successful non-idempotent task transition write.
- `created_by_id`, `created_by_role`, `created_by_branch_id`: structural actor snapshot.
- `create_reason_code`: existing domain create reason code.
- `completed_at`, `completion_reason_code`: nullable completion metadata.
- `cancelled_at`, `cancellation_reason_code`: nullable cancellation metadata.
- `reopened_at`, `reopen_reason_code`: nullable reopen metadata.
- `created_at`, `updated_at`: required timestamps.

`crm_task_history` should minimally store:

- `id`: history id.
- `tenant_id`: required tenant id.
- `task_id`: required task id.
- `event`: existing domain event kind.
- `from_status`: nullable prior status.
- `to_status`: required next status.
- `reason_code`: required domain reason code.
- `actor_id`, `actor_role`, `actor_branch_id`: structural actor snapshot.
- `occurred_at`: transition timestamp.
- `created_at`: insert timestamp.

Required indexes and constraints:

- `crm_tasks_tenant_id_id_uq` on `(tenant_id, id)`.
- `crm_tasks_tenant_idempotency_uq` unique on `(tenant_id, idempotency_key)` where
  `idempotency_key is not null`.
- `crm_tasks_tenant_status_due_idx` on `(tenant_id, status, due_at)` for admin and tenant-wide
  due-task queries that do not filter by branch.
- `crm_tasks_tenant_branch_status_due_idx` on `(tenant_id, branch_id, status, due_at)`.
- `crm_tasks_tenant_subject_idx` on `(tenant_id, subject_kind, subject_id)`.
- `crm_tasks_tenant_assigned_actor_status_due_idx` on
  `(tenant_id, assigned_actor_id, status, due_at)`.
- `crm_task_history_tenant_task_occurred_idx` on `(tenant_id, task_id, occurred_at)`.
- Composite tenant/task FK from `crm_task_history` to `crm_tasks`.
- Composite tenant/branch FK from `crm_tasks.branch_id` and assignment branch fields to
  `branches` where applicable.
- CHECK constraints for status, priority, subject kind, assignment kind, event kind, and reason
  code sets matching `packages/domain-crm/src/tasks/types.ts`.
- CHECK constraint that `lifecycle_version >= 1`.

Foreign-key policy for subject references:

- Do not add one polymorphic FK for `subject_kind` and `subject_id`.
- Enforce subject existence in the adapter through explicit subject-kind branches.
- Keep `lead`, `deal`, and `support_handoff` checks tenant-scoped and branch-aware.
- Return `subject_not_visible`, `subject_not_found`, or `subject_proof_missing` rather than writing
  a dangling task.

## Adapter Contract

The app-side adapter must:

- Accept and return pure `CrmTask` objects from `@interdomestik/domain-crm/tasks`.
- Keep the `CrmTaskRepository` port read+write for parity with the existing
  `leads/repository.ts`, `deals/repository.ts`, and `support-handoffs/repository.ts` patterns.
- Source tenant scope from `actor.tenantId` only; adapter methods must not accept or trust a
  separate tenant id for read/write scoping.
- Convert database timestamps to ISO strings on output and convert ISO strings to database
  timestamps on writes.
- Preserve `readonly` domain output shape by returning new objects, not mutable row references.
- Persist assignment targets without raw display names, emails, phone numbers, narrative, or
  subject text.
- Hydrate task history ordered by `occurred_at`, then `created_at`, then `id` for deterministic
  output.
- Insert task and initial history in the same transaction.
- Insert task and initial history in the same transaction with `lifecycleVersion = 1`.
- Append later history only after a scoped compare-and-set task update succeeds with the caller's
  `expectedLifecycleVersion`.
- Increment `lifecycleVersion` by exactly one for each successful non-idempotent transition and
  leave it unchanged for idempotent no-ops.
- Constrain reads by `actor.tenantId` and actor branch scope before returning a task.
- Treat admin as tenant-wide, while agent, staff, and branch-manager actors remain branch-scoped
  when the task has a branch.
- Rely on the existing connection-level `app.current_tenant_id` GUC for RLS enforcement; tests must
  prove a query with the GUC unset returns zero task rows.
- Throw only for unexpected repository failures; expected domain denials should be represented
  through typed domain results before adapter write calls where possible.

## Concurrency Contract

CRM25 must not silently diverge from the existing support-handoff optimistic concurrency pattern.

- `CrmTask` must carry `lifecycleVersion`.
- `saveTask` and `appendTaskHistory` must require `expectedLifecycleVersion`.
- The adapter must update `crm_tasks` with a predicate on `tenant_id`, `id`, actor-visible branch
  scope, and `lifecycle_version = expectedLifecycleVersion`.
- If the scoped compare-and-set update affects zero rows, the adapter must return or surface a
  deterministic repository conflict; it must not append history.
- Task history append must run in the same transaction as the task update and use the resulting next
  lifecycle version.
- Tests must cover two writers starting from the same version where exactly one update succeeds and
  only the successful writer appends history.
- Idempotent replay of equivalent material may return the stored task without incrementing
  lifecycle version or appending history.

## Subject Visibility Contract

Branch inheritance matrix:

| Subject state                | Actor state                         | Task branch result                                                         |
| ---------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| subject has `branch_id = B1` | admin in same tenant                | task branch is `B1`                                                        |
| subject has `branch_id = B1` | actor has `scope.branchId = B1`     | task branch is `B1`                                                        |
| subject has `branch_id = B1` | actor has `scope.branchId = B2`     | fail closed as `subject_not_visible`                                       |
| subject has `branch_id = B1` | actor lacks branch scope, non-admin | fail closed as `subject_not_visible`                                       |
| subject branch is null       | admin in same tenant                | task branch remains null                                                   |
| subject branch is null       | non-admin actor                     | fail closed unless a later gate authorizes tenant-wide non-admin task work |

For `lead` subjects:

- Lookup must constrain `crm_leads.id`, `crm_leads.tenant_id`, and branch visibility.
- Agent actors must not see another agent's lead unless an existing domain rule explicitly allows
  it; this gate does not add such a rule.

For `deal` subjects:

- Lookup must constrain `crm_deals.id`, `crm_deals.tenant_id`, `archived_at is null`, and branch
  visibility where a branch is present.

For `support_handoff` subjects:

- Lookup must constrain `support_handoffs.id`, `support_handoffs.tenant_id`, and branch visibility.
- The adapter must not copy support-handoff message bodies, public responses, member replies, or
  close reasons into task rows.

For `account` and `contact` subjects:

- The adapter must fail closed because durable CRM account/contact tables are not present in the
  current repo.
- Do not create account/contact tables in CRM25.
- A later gate may promote account/contact persistence or subject adapter support.

If a subject row disappears between `validateSubjectReference` and `findTaskById`, the adapter must
return no visible task for branch-limited actors and must not rehydrate a task as authorized work.
CRM25 tests must pin this orphaned-subject behavior for at least one supported subject kind.

## Fail-Closed Rules

CRM task persistence must fail closed when:

- actor context is missing, malformed, or unsupported by the domain task role rules;
- actor tenant and task tenant differ;
- requested task id or idempotency key is malformed;
- subject visibility proof is missing, unsupported, not found, not tenant-scoped, or not visible to
  the actor branch;
- account/contact task persistence is requested before durable account/contact tables exist;
- assignment target is cross-tenant, malformed, or outside actor branch scope;
- task branch and assignment branch conflict;
- persisted row contains a status, priority, subject kind, assignment kind, event kind, or reason
  code outside the domain constants;
- duplicate idempotency key points at non-equivalent task material;
- save or history append is attempted with a stale or missing expected lifecycle version;
- history append would duplicate a transition or append to the wrong tenant/task;
- history append would occur without a corresponding scoped task update;
- output hydration would require raw lead, member, claim, insurer, medical, legal, assistance, or
  support-message text;
- RLS is disabled or tenant policy proof is missing for either table.

History append discipline must be database-backed where practical. CRM25 should either revoke
`UPDATE` and `DELETE` on `crm_task_history` from the app runtime role or add required RLS/guard tests
that prove history rows cannot be updated or deleted through the normal application path.

## Privacy, Consent, And AI Boundary

- CRM task rows may store structural subject references and transition reason codes only.
- CRM task rows must not store lead notes, full names, company names, phone, email, insurer
  correspondence, medical facts, legal strategy, claim narratives, support-handoff message bodies,
  assistance summaries, or document text.
- Task existence must not imply consent, Professional Recovery authorization, POA, assignment,
  success-fee agreement, submission authority, or third-party communication authority.
- Consent, retention, DSR, and deletion behavior remain adapter and future privacy-slice
  responsibilities. CRM25 must avoid embedding duplicated sensitive content so later deletion and
  retention rules can follow the source subject.
- The named follow-on design target is `P40-DG0x CRM Task Retention And DSR Alignment`. That later
  gate must decide whether task rows are hard-deleted, soft-archived, cancelled/reaped, or retained
  as structural audit records when the source subject is deleted under DSR or retention policy.
- CRM25 must not import `@interdomestik/domain-privacy`; it should align by keeping task data
  structural and by testing missing-source-subject behavior.
- No AI behavior is introduced. CRM25 must not add model calls, prompts, embeddings, AI scoring,
  AI routing, summarization, extraction, or agentic/tool-using behavior.
- No `@interdomestik/domain-assistance`, `@interdomestik/domain-privacy`,
  `@interdomestik/domain-claims`, upload/storage, billing, finance, marketing, scheduler,
  notification, or outbox worker dependency is authorized.

## Migration Shape Constraints

CRM25 migration work must be additive for shared environments:

- No `NOT NULL` columns on existing tables.
- No changes to existing `crm_leads`, `crm_deals`, `support_handoffs`, `crm_activities`, or
  `branches` table columns.
- No new RLS policies on existing tables.
- No backfill or rewrite of existing CRM records.
- No data migration that blocks deploy on historical row quality.
- Migration journal metadata must be complete and pass `pnpm db:migrations:check-journal`.
- RLS coverage must include both new tables and pass `pnpm db:rls:test:required`.
- Rollback posture is additive-table safe: prefer leaving unused tables in place over destructive
  down-migration unless a later data-safe rollback is explicitly approved.

## Non-Goals

- Runtime task UI on `/agent`, `/staff`, `/admin`, `/member`, `/agent/crm`, or lead-detail
  surfaces.
- New routes, server actions, or API endpoints.
- Scheduler, cron, due-task runner, reminders, notification fanout, email, SMS, WhatsApp, push, or
  outbox emission.
- CRM templates, sequences, scoring, consent/preference implementation, or automated routing
  triggers.
- Lead follow-up migration from `crm_activities` to `crm_tasks`.
- Account/contact durable persistence.
- Assistance-session intent execution, CRM lead creation from assistance, claim creation,
  support-handoff creation, Professional Recovery activation, billing, finance, agreement, POA,
  assignment, or airline/insurer/third-party submission workflows.
- Task-state recovery, paused-task resume, retry replay infrastructure, or user workflow
  rehydration.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture, Stripe,
  README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- `crm_tasks` and `crm_task_history` are additive, tenant-scoped, RLS-protected tables with
  migration journal metadata.
- The migration does not alter existing CRM/support/branch tables, does not add RLS policies to
  existing tables, and introduces no existing-table `NOT NULL` constraints.
- Database schema exports are available from `packages/database/src/schema/crm.ts` and the package
  type-checks.
- The app-side adapter implements the `CrmTaskRepository` port with the approved pure-domain
  lifecycle-version extension.
- Adapter round-trips `CrmTask` aggregate fields and deterministic history order.
- `findTaskById` and `findTaskByIdempotencyKey` constrain by actor tenant and branch visibility.
- `saveTask` and `appendTaskHistory` perform scoped writes and fail closed for tenant/branch
  mismatch.
- `saveTask` and `appendTaskHistory` use `expectedLifecycleVersion`; stale version writes do not
  update the task and do not append history.
- Duplicate idempotency keys return equivalent stored task behavior or typed conflict expectations
  without duplicate rows.
- Equivalent idempotency material is defined as tenant, subject reference, assignment target,
  priority, normalized due date, create reason, and created-by actor snapshot.
- `validateSubjectReference` proves tenant/branch visibility for `lead`, `deal`, and
  `support_handoff`; `account` and `contact` fail closed until durable tables exist.
- Subject disappearance after validation is tested and fails closed on later task reads.
- RLS proof shows both new tables return zero rows with `app.current_tenant_id` unset and isolate
  tenants when the GUC is set.
- `crm_task_history` cannot be updated or deleted through the normal application path, or the PR
  explains the strongest enforceable alternative with tests.
- No raw PII or sensitive subject content is stored in task or history rows.
- No runtime UI, route, server action, scheduler, notification, outbox, AI, assistance execution,
  proxy, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc change is included.

## Implementation Review Plan

Because CRM25 introduces schema, RLS, and app-side persistence for a future workflow primitive, the
implementation PR must include independent review evidence before merge. Reviewer areas:

- Security/privacy: RLS tenant isolation, branch visibility, subject-reference handling,
  no sensitive content duplication, no consent inference, DSR deferral alignment, and no
  cross-domain imports.
- Platform/database: additive migration shape, composite tenant FKs, indexes, CHECK constraints,
  lifecycle-version compare-and-set behavior, migration journal correctness, and rollback path.
- Domain/adapter boundary: pure `domain-crm` remains SQL-free; adapter faithfully maps the
  `CrmTaskRepository` port.
- Product/workflow: task persistence does not silently replace lead follow-ups, support-handoff
  lifecycle, routing assignments, or assistance intents.
- QA/gates: focused tests prove tenant/branch denial, subject visibility denial, idempotency,
  lifecycle-version conflict handling, history append discipline, PII-safe rows, and RLS engagement.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: task persistence can become an implicit runtime workflow before UI, scheduler, notification,
  and authorization rules are separately designed.
- High: existing lead follow-ups already persist as `crm_activities`; CRM25 must coexist and not
  migrate or double-write follow-ups.
- High: tasks can become an unauthorized bridge from assistance intents into CRM side effects. This
  gate keeps assistance execution blocked.
- Medium: account/contact subject kinds are contract-valid but lack durable tables. The adapter must
  fail closed until a later persistence slice exists.
- Medium: polymorphic subject references cannot be enforced with a single FK. Adapter-level proof
  and tests must compensate.
- Medium: branch semantics differ across lead, deal, and support-handoff rows. Tests must pin
  branch-denial behavior before UI depends on it.
- Medium: lifecycle-version concurrency requires a small domain contract extension. Keeping it in
  CRM25 is safer than deferring and later retrofitting persistence once UI or scheduler writes exist.
- Medium: future scheduler and notification slices will need due-date indexes and idempotency
  behavior. CRM25 should add only the persistence foundation, not the scheduler contract.
- Medium: DSR and retention behavior will need later source-subject alignment. Avoid duplicated raw
  subject content now to keep that tractable; `P40-DG0x CRM Task Retention And DSR Alignment`
  remains the named follow-up.

Rollback path: because CRM25 adds additive tables and app-side adapter code with no runtime callers,
rollback is a normal revert PR before later slices depend on the tables. If a migration has already
run in shared environments, rollback should prefer leaving unused additive tables in place unless a
separate data-safe down-migration is approved.

## Approval Bar

Approve DG02 only if:

- `P40-CRM24` predecessor proof is accepted as complete.
- Only `P40-CRM25 CRM Task Persistence And Repository Adapter` is promoted.
- Persistence is limited to additive tables, RLS, schema exports, app-side adapter, the narrow
  lifecycle-version domain contract extension, and focused tests.
- Optimistic concurrency is explicit through `lifecycleVersion` and `expectedLifecycleVersion`.
- `account` and `contact` subject persistence remains fail-closed until durable account/contact
  tables exist.
- DSR/retention behavior is explicitly deferred to `P40-DG0x CRM Task Retention And DSR Alignment`
  and CRM25 avoids duplicated sensitive subject content.
- Runtime UI, server actions, routes, scheduler, notifications, templates, sequences, scoring,
  assistance execution, follow-up migration, proxy/canonical route/auth/tenancy changes, Stripe,
  README, AGENTS, and broad architecture-doc changes remain blocked.

## Verification

Design-gate PR verification should include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs-only delta

Implementation proof for `P40-CRM25` should include:

- focused CRM task adapter tests;
- `pnpm --filter @interdomestik/domain-crm type-check`;
- `pnpm --filter @interdomestik/domain-crm test:unit`;
- `pnpm --filter @interdomestik/database type-check`;
- `pnpm --filter @interdomestik/web type-check`;
- `pnpm db:migrations:check-journal`;
- `pnpm db:rls:test:required`;
- DB/RLS tests covering `crm_tasks` and `crm_task_history`;
- `pnpm security:guard`;
- `pnpm pr:verify`;
- `pnpm e2e:gate`.

## Completion State

| Item                                                        | Status    | Decision                                                          |
| ----------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `P40-CRM24 CRM Task Domain Foundation`                      | completed | Predecessor task contracts are complete and exported.             |
| `P40-DG02 CRM Task Persistence And Repository Adapter Gate` | completed | This gate promotes the next bounded persistence slice.            |
| `P40-CRM25 CRM Task Persistence And Repository Adapter`     | promoted  | Additive task persistence, RLS, adapter, lifecycle-version proof. |
| Later P40 UI/scheduler/notification/template/sequence work  | reserved  | No implementation authority from this review draft.               |
