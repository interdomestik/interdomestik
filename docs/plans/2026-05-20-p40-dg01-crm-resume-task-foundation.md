# P40-DG01 CRM Lane Resumption And Task Foundation Design Gate

Status: complete
Slice: `P40-DG01`
Owner: platform + product + security + qa
Phase: Phase C
Date: 2026-05-20
Authority: repo-canonical closeout-and-promotion gate. This document closes the package-only P39
assistance contract lane after `P39-ASSIST-09`, resumes the CRM product-depth lane, and promotes
exactly one next CRM implementation slice.

Status vocabulary: `review_draft` means not approved, `complete` records an approved design or
closeout gate, and `deferred` records an explicitly postponed candidate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

Phase C means the V3 pilot constraints remain active: `apps/web/src/proxy.ts` is the routing,
access-control, and tenant-isolation authority; canonical `/member`, `/agent`, `/staff`, and
`/admin` routes remain fixed; no auth, tenancy, routing, or broad domain architecture refactor is
authorized by this gate.

## Revision History

| Revision | Date       | Notes                                                                                                   |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `r1`     | 2026-05-20 | Initial P40-DG01 closeout-and-promotion draft after P39-ASSIST-09 merge proof.                          |
| `r2`     | 2026-05-20 | Review clarifications for lane-resumption wording, task contract shape, fail-closed rules, and privacy. |

## Definitions

- CRM lane resumption: the program sequence returns to CRM product-depth work after the package-only
  P39 assistance lane. It does not mean task-state recovery, paused-task restart, session resume,
  retry replay, or user workflow rehydration.
- CRM task: a pure `packages/domain-crm` aggregate representing a bounded item of CRM work assigned
  to an actor or role-scoped target. It is not a notification, scheduler job, template, sequence,
  assistance intent, support-handoff message, or lead activity row.
- Task aggregate: the typed domain object plus transition helpers, result envelopes, and repository
  port expectations needed before persistence or UI adapters exist.
- Subject reference: a PII-safe structural pointer from a task to an allowed CRM subject kind and
  id. The initial allowlist is `lead`, `deal`, `account`, `contact`, and `support_handoff`.
- Actor context: the existing `CrmActorContext` contract from `packages/domain-crm/src/context.ts`.
- Tenant scope: the actor tenant and task tenant must match before any task mutation or repository
  write expectation is allowed.
- Branch scope: an optional branch dimension inherited from the actor, assignment target, or subject
  reference proof supplied by a later adapter.
- Terminal state: a task status that blocks normal mutation. Initial terminal states are
  `completed` and `cancelled`.
- Reopen: a deterministic transition from `completed` back to active work only when the contract can
  prove a reopen reason, actor authority, same tenant, non-cancelled state, and monotonic timestamp.
- Idempotent no-op: repeated equivalent input returns the same typed result expectation without
  adding duplicate history or implying a second side effect.
- Append-style activity log: the existing CRM pattern of preserving state-change evidence as
  explicit lead activity or history entries. P40-CRM24 must express task history expectations, not
  invent a database table.

## Predecessor Dependency

`P39-ASSIST-09 Assistance Session Workflow Wiring Contract` is the direct predecessor for this gate.

Predecessor proof:

- `P39-DG09 Assistance Session Workflow Wiring Design Gate` is recorded in
  `docs/plans/2026-05-19-p39-dg09-assistance-session-workflow-wiring-design.md`.
- `P39-ASSIST-09` merged through PR `#825`, merge commit
  `35a011372eff9b16c879ddadbf7313d92bc48bd1`.
- `P39-ASSIST-09` shipped public workflow-intent contracts over `AssistanceSessionDigest`,
  deterministic readonly intent lists with literal `executionAllowed: false`, fail-closed blocker
  codes, existing `AssistanceOutcomeKind` and `AssistanceDisclaimerCode` reuse, hash-safe reference
  keys, scoped digest evidence pairing, and focused unit proof for supported, incomplete, sensitive,
  AI-assisted, side-effect-attempt, and leakage scenarios.
- Local proof passed `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate`; remote proof
  passed SonarCloud, unit, static, PR E2E, e2e-gate, Pilot Gate, commitlint, gitleaks, pnpm-audit,
  validation-surface, pr-finalizer, and Vercel ignored-build checks before merge.

P39 remains intentionally package-only. It did not authorize runtime Help Now UI, assistance
workflow execution, upload flows, database persistence/RLS, CRM/claim/handoff creation,
outbox/event emission, Professional Recovery activation, autonomous AI workflows, model calls,
prompt changes, proxy/canonical route/auth/tenancy/routing changes, Stripe, README, AGENTS, or
broad architecture-doc changes.

## Source Inputs

- CRM roadmap: `docs/plans/2026-05-13-p38-crm-state-of-art-roadmap.md`.
- CRM foundation closeout: `docs/plans/2026-05-16-p38-dg22-crm23-foundation-closeout.md`.
- Assistance workflow gate:
  `docs/plans/2026-05-19-p39-dg09-assistance-session-workflow-wiring-design.md`.
- Current program/tracker records: `docs/plans/current-program.md` and
  `docs/plans/current-tracker.md`.
- CRM package exports: `packages/domain-crm/src/index.ts`.
- CRM actor context: `packages/domain-crm/src/context.ts`, including `CrmActorContext`,
  `CrmActorRole`, and `CRM_ACTOR_ROLES`.
- CRM follow-up pattern: `packages/domain-crm/src/leads/follow-up.ts`, including
  `CrmLeadFollowUpResult` and the existing `follow_up` activity-type shape.
- CRM support-handoff state pattern: `packages/domain-crm/src/support-handoffs/state.ts` and
  `packages/domain-crm/src/support-handoffs/types.ts`, including explicit lifecycle states and
  `lifecycleVersion`.
- CRM timeline projection pattern: `packages/domain-crm/src/timeline/read-model.ts`, including
  `CrmTimelineItem` and `CrmTimelineItemKind`.
- CRM lead activity pattern: `packages/domain-crm/src/lead-activities/`.
- CRM repository-port style: `packages/domain-crm/src/leads/repository.ts`,
  `packages/domain-crm/src/deals/repository.ts`, and
  `packages/domain-crm/src/support-handoffs/repository.ts`.

## Decision

Open `P40 CRM Product Depth`.

Promote exactly one implementation slice:

`P40-CRM24 CRM Task Domain Foundation`

The promoted slice is a pure `packages/domain-crm` contract slice for CRM tasks. It must define the
smallest task aggregate, state-transition boundary, result envelope, idempotency expectations, and
repository-port contract needed before task persistence, UI, scheduler, notifications, templates,
sequences, scoring, or assistance-intent execution can be considered.

The intended later ordering is task contracts first, then separately promoted persistence/adapters,
then UI, then scheduler/notification behavior, then templates/sequences. This ordering is guidance,
not authority for later slices.

## Candidate Ranking

| Rank | Candidate                              | Decision | Rationale                                                                                                                     |
| ---- | -------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM24 CRM Task Domain Foundation` | Promote  | CRM tasks are the first deferred product-depth item and can be introduced safely as pure domain contracts before runtime use. |
| 2    | Task persistence and agent/staff UI    | Defer    | Persistence and UI need stable task contracts, authorization semantics, and focused user-workflow proof first.                |
| 3    | CRM templates foundation               | Defer    | Templates depend on task/activity semantics and should not be designed before the task boundary exists.                       |
| 4    | CRM sequences or automation            | Defer    | Sequences imply scheduling, notification fanout, failure recovery, consent controls, and outbox behavior.                     |
| 5    | Assistance intent execution into CRM   | Reject   | ASSIST-09 intents are not authorization; adapters need separate consent, RLS, audit, idempotency, and rollback proof.         |

## Promoted Slice Scope

Authorized implementation scope for `P40-CRM24`:

- Add pure `packages/domain-crm` task types, constants, repository ports, state-transition helpers,
  result envelopes, and focused unit tests.
- Model task identity, tenant identity, subject references, `CrmActorContext`, assignment target,
  status, priority, due date, completion/cancellation metadata, history entries, and deterministic
  clock/ID injection.
- Support only bounded subject references needed by existing CRM foundations: `lead`, `deal`,
  `account`, `contact`, and `support_handoff`.
- Define explicit task state transitions: create, assign, reassign, update due metadata, complete,
  cancel, and reopen only where the reopen precondition is deterministic.
- Express append-style task history and repository-port expectations for later adapters. Do not
  claim an existing task table or append-only task event table exists.
- Reuse named `domain-crm` patterns: `CrmActorContext` for actor identity,
  `CrmLeadFollowUpResult` for result-envelope ergonomics, support-handoff lifecycle-state and
  `lifecycleVersion` ergonomics for explicit state handling, `CrmTimelineItem` for downstream
  projection shape, and existing repository-port style from lead/deal/support-handoff modules.
- Define idempotency expectations for duplicate task creation and repeated metadata transitions.
- Add focused tests for valid task creation, invalid tenant/actor/subject combinations, assignment
  authorization shape, due-date normalization, terminal-state blocking, deterministic reopen
  preconditions, idempotent no-op handling, non-monotonic timestamp rejection, and PII-safe output.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.

The expected implementation delta should stay below roughly 60 KB of source/test text unless the PR
body explains why the task contract needs more room. The expected delta should stay package-local.
If a later implementation needs web, database, E2E, scheduler, notification, template, sequence,
scoring, or assistance-adapter work, that must be promoted by a later gate.

## CRM Task Contract

`P40-CRM24` must treat CRM tasks as a pure domain contract, not as runtime persistence, UI, or
automation.

The initial task type must be able to represent at least:

- `taskId`: deterministic task identifier supplied by injected ID generation or caller input.
- `tenantId`: tenant identifier that must match `actor.tenantId`.
- `subjectReference`: `{ kind, id }`, where `kind` is one of `lead`, `deal`, `account`, `contact`,
  or `support_handoff`.
- `createdBy`: actor snapshot limited to stable actor id, role, tenant, and optional branch or staff
  assignment scope.
- `assignedTo`: actor, role, team, or unassigned target shape that is structural and PII-safe.
- `status`: initial enum values `pending`, `in_progress`, `completed`, and `cancelled`.
- `priority`: initial enum values `low`, `normal`, `high`, and `urgent`.
- `dueAt`: ISO-8601 string or null, normalized by injected clock semantics and never represented as
  a raw `Date` in public output.
- `createdAt`, `updatedAt`, `completedAt`, `cancelledAt`, and optional `reopenedAt`: ISO-8601
  strings derived from injected clock input.
- `idempotencyKey`: caller-supplied stable key for create-like operations when the caller can prove
  retry equivalence. Content hashing may be used only as deterministic reference material, not as
  authority to merge unrelated tasks.
- `history`: readonly state-change entries carrying event kind, timestamp, actor snapshot, previous
  status, next status, and reason code. History entries must not carry raw subject text.

Initial transition matrix:

| Current status | Allowed transition      | Notes                                                                   |
| -------------- | ----------------------- | ----------------------------------------------------------------------- |
| none           | create `pending`        | Requires tenant, actor, subject reference, id, timestamp, and priority. |
| `pending`      | assign/reassign         | Same tenant and authorized actor shape required.                        |
| `pending`      | update due metadata     | Repeated same due date may be an idempotent no-op.                      |
| `pending`      | `in_progress`           | Explicit start transition or assignment policy may activate work.       |
| `pending`      | `completed`             | Requires completion reason and completion timestamp.                    |
| `pending`      | `cancelled`             | Requires cancellation reason and cancellation timestamp.                |
| `in_progress`  | assign/reassign         | Same tenant and authorized actor shape required.                        |
| `in_progress`  | update due metadata     | Repeated same due date may be an idempotent no-op.                      |
| `in_progress`  | `completed`             | Requires completion reason and completion timestamp.                    |
| `in_progress`  | `cancelled`             | Requires cancellation reason and cancellation timestamp.                |
| `completed`    | reopen to `in_progress` | Allowed only with deterministic reopen reason and monotonic timestamp.  |
| `cancelled`    | no transition           | Cancelled is terminal for CRM24.                                        |

The result envelope should mirror the existing `CrmLeadFollowUpResult` style: success returns the
task and transition metadata; failure returns a typed reason without throwing for expected domain
denials. Expected failure reasons include invalid actor, tenant mismatch, invalid subject reference,
invalid assignment target, invalid status transition, terminal state, non-monotonic timestamp,
duplicate idempotency conflict, unsupported priority, unsupported due date, and repository failure
where a port operation is part of the helper contract.

Subject existence proof is deferred to later adapters. CRM24 may define a repository port that can
validate subject visibility or accept a subject proof object, but it must not import database,
web, route, server-action, assistance, privacy, claim, upload, or storage modules to perform that
proof.

## Fail-Closed Rules

CRM task mutations must fail closed when:

- actor context is missing, malformed, or has a role outside the allowed CRM actor roles;
- task tenant and actor tenant are missing or mismatched;
- subject reference kind is missing, unsupported, or not in the allowlist;
- subject reference id is missing or malformed;
- assignment target is missing where required, unsupported, cross-tenant, or outside actor role
  scope;
- branch-scoped assignment is requested without branch scope or with mismatched branch scope;
- due date, created time, updated time, completion time, cancellation time, or reopen time is
  missing where required, invalid, or non-monotonic;
- create-like input repeats an idempotency key with conflicting task material;
- complete, cancel, or reopen is attempted from an unsupported source status;
- cancelled task is reopened or mutated;
- completed task is reopened without deterministic reopen reason and authorized actor shape;
- terminal-state no-op handling would hide a conflicting transition;
- output would embed raw lead, member, claim, insurer, medical, legal, assistance, or support
  narrative text;
- implementation attempts to infer consent, Professional Recovery authorization, POA, assignment,
  fee agreement, submission authority, or assistance execution from the presence of a task.

Dangling subject references must be represented as adapter responsibility. The pure package may
return typed `subject_not_visible`, `subject_not_found`, or `subject_proof_missing` results if a
repository port is supplied, but it must not perform database reads or treat missing proof as
authorization to create runtime records.

## Idempotency And Determinism

- Task creation must accept an explicit idempotency key when the caller is retrying the same
  create-like operation. Repeating the same key with equivalent task material should return an
  idempotent existing-task or no-op result expectation; repeating the same key with conflicting
  material must fail closed.
- Repeated due-date updates with the same normalized `dueAt` value may return an idempotent no-op
  without adding history. A different `dueAt` value must produce a new transition expectation.
- Repeated complete or cancel calls against already terminal state must not create duplicate history.
  The contract must distinguish safe duplicate completion from conflicting terminal mutation.
- Deterministic ID generation and clock behavior must be injected. Helpers must not call ambient
  `Date.now()`, `crypto.randomUUID()`, database sequences, scheduler APIs, or process-level random
  sources directly.
- Public outputs must be readonly and stably ordered where lists are returned.

## Privacy And AI Boundary

- CRM tasks may reference subjects that later carry member, lead, claim, insurer, medical, legal,
  or Professional Recovery context. CRM24 may store only structural subject references and reason
  codes, not raw narrative, document text, insurer correspondence, medical facts, legal strategy,
  phone/email content, or support-message bodies.
- Task existence must not imply consent, authorization, submission authority, Professional Recovery
  activation, POA, assignment, or fee-agreement acceptance.
- Task history should use actor identifiers, role, tenant, optional branch, transition code, and
  timestamp. It should not duplicate sensitive subject content.
- DSR, retention, and deletion handling remain adapter responsibilities. CRM24 must keep subject
  references structural so later persistence can align with existing retention and deletion
  contracts.
- No `domain-privacy`, `domain-assistance`, `domain-claims`, upload/storage, database, app route, or
  server-action import is authorized.
- No AI behavior is introduced. CRM24 must not add model calls, prompt changes, embeddings,
  retrieval, AI scoring, AI routing, AI summarization, or agentic/tool-using workflows.

If later AI, assistance-intent execution, or automated routing wants to create or mutate tasks, it
must come through a separate gate with explicit authorization, idempotency, audit, privacy, and
human-review boundaries.

## Domain Coupling Boundary

P40-CRM24 must not import:

- `@interdomestik/domain-assistance`;
- `@interdomestik/domain-privacy`;
- `@interdomestik/domain-claims`;
- database packages, Drizzle schema, migrations, or RLS helpers;
- app routes, server actions, UI components, Playwright fixtures, upload/storage modules, billing,
  finance, notification, scheduler, outbox worker, or marketing modules.

No other package should gain a new import on the CRM task surfaces in the CRM24 PR unless the design
is explicitly amended. The first implementation should publish contracts and tests only.

## Non-Goals

- Runtime UI on `/agent`, `/staff`, `/admin`, `/member`, `/agent/crm`, or lead-detail surfaces.
- Database schema, migrations, RLS, Drizzle adapters, backfills, or persistence.
- Scheduler, cron, due-task runner, notification fanout, outbox worker, email, SMS, WhatsApp, or
  push behavior.
- CRM templates, sequences, scoring, consent/preference implementation, routing audit retention, or
  automated routing triggers.
- Assistance-session intent execution, CRM lead creation from assistance, claim creation,
  support-handoff creation, Professional Recovery activation, billing, finance, agreement, POA,
  assignment, or airline/insurer/third-party submission workflows.
- Task-state recovery, paused-task resume, retry replay infrastructure, or user workflow
  rehydration.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture, Stripe,
  README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM24` exposes public, typed, deterministic CRM task domain contracts from
  `packages/domain-crm`.
- The contract includes task identity, tenant identity, subject references, actor context,
  assignment target, status, priority, due dates, idempotency expectations, transition history,
  result envelopes, and repository-port expectations.
- Task mutations fail closed for missing or mismatched tenant, actor, subject, assignment, branch,
  status, idempotency, and timestamp state.
- Terminal-state, assignment, due-date, completion, cancellation, and reopen transitions are
  explicit and covered by focused unit tests.
- Outputs are PII-safe and do not embed raw lead, member, claim, insurer, medical, legal,
  assistance, or support-message text.
- The implementation remains SQL-free, route-free, UI-free, scheduler-free, notification-free,
  outbox-free, AI-free, and independent of `domain-assistance`.
- No proxy, canonical route, auth, tenancy, schema/RLS, Stripe, README, AGENTS, or broad
  architecture-doc change is included.
- An independent implementation review verifies security/privacy, platform/domain purity,
  product/workflow semantics, QA/fail-closed coverage, idempotency, and coupling boundaries.

## Implementation Review Plan

Because CRM24 defines a new shared task aggregate with future persistence, scheduler, assistance,
and workflow implications, the implementation PR must include independent review evidence before
merge. Reviewer areas:

- Security/privacy: PII-safe outputs, subject-reference handling, no consent inference, no raw
  sensitive fixture use, and no unauthorized cross-domain imports.
- Product/workflow: task semantics do not collide silently with lead follow-ups, support handoffs,
  or assistance intents.
- Platform/domain purity: package remains pure, SQL-free, route-free, UI-free, side-effect-free,
  deterministic, and acyclic.
- QA/gates: fail-closed tests cover missing/mismatched tenant, actor, subject, assignment, branch,
  terminal-state, idempotency, timestamp, and PII-leak cases.
- Maintainability: state-transition helpers are explicit, small, and reusable without creating a
  framework or hidden runtime dependency.

Independent reviewer may be a subagent where available or a human sidecar otherwise.

## Risks And Open Questions

- High: CRM tasks can drift into runtime scheduler, notification, or UI behavior before the contract
  is stable.
- High: tasks overlap semantically with existing lead follow-ups, which currently use
  `follow_up` lead activities. CRM24 must name the overlap and keep migration or coexistence as a
  later decision.
- High: tasks can become a hidden bridge from assistance intents into CRM side effects. This gate
  blocks assistance-intent execution.
- Medium: append-style task history may overlap with lead activities, deal histories, and timeline
  projections. The first implementation should define expectations without adding persistence.
- Medium: cross-branch task reassignment authorization may need adapter proof once persistence and
  UI exist.
- Medium: dangling subject references need later adapter decisions for subject deletion, DSR,
  tenant deletion, and visibility failures.
- Medium: due-task scheduler hooks may need repository ports later, but no scheduler port is
  authorized by CRM24.
- Medium: future outbox or event emission needs separate idempotency, audit, and rollback proof.

Rollback path: because CRM24 is pure domain code, rollback is a normal revert PR before runtime
callers depend on it. If exported identifiers are consumed by a later PR, deprecate before removal.

## Approval Bar

Approve DG01 only if:

- `P39-ASSIST-09` predecessor proof is satisfied.
- "CRM lane resumption" is understood as program sequencing only, not task-state recovery or
  runtime resume behavior.
- Only `P40-CRM24 CRM Task Domain Foundation` is promoted.
- Scope is pure `packages/domain-crm` task contracts, exports, and focused tests.
- Task model, subject-reference allowlist, state transitions, idempotency, fail-closed behavior,
  privacy/AI boundary, and non-import rules are explicit.
- Runtime UI, persistence/RLS, scheduler, notifications, templates, sequences, scoring, assistance
  execution, CRM/claim/handoff creation from assistance, proxy/canonical route/auth/tenancy/routing
  changes, Stripe, README, AGENTS, and broad architecture-doc changes remain blocked.

## Verification

Design-gate PR verification must include:

- `git diff --check`
- `pnpm plan:status`
- `pnpm track:audit`
- `pnpm plan:audit`
- `pnpm docs:verify`
- `pnpm repo:size:check`
- `interdomestik_qa.scope_audit` for the allowed docs/budget-only delta

Implementation proof runs in the promoted `P40-CRM24` PR. Expected focused proof includes
`pnpm --filter @interdomestik/domain-crm test:unit` and
`pnpm --filter @interdomestik/domain-crm type-check`, followed by the required repository gates.
The implementation PR must stay package-local unless a later gate amends the scope.

## Completion State

| Item                                                           | Status    | Decision                                                                        |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `P39-ASSIST-09 Assistance Session Workflow Wiring Contract`    | completed | Predecessor implementation completed through PR `#825`.                         |
| `P40-DG01 CRM Lane Resumption And Task Foundation Design Gate` | completed | This gate closes the package-only P39 lane and opens P40 product depth.         |
| `P40-CRM24 CRM Task Domain Foundation`                         | promoted  | Only pure CRM task domain contracts, exports, and focused tests are authorized. |
| Later P40 persistence/UI/scheduler/template/sequence slices    | reserved  | No implementation authority from this gate.                                     |
