# P40-DG01 CRM Resume And Task Foundation Design Gate

Status: complete
Slice: `P40-DG01`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-20
Authority: completed closeout and design gate. This document closes the package-only P39
assistance contract lane after `P39-ASSIST-09` and promotes exactly one next CRM implementation
slice.

Status vocabulary: `complete` records a completed design/closeout gate. Tracker queue statuses
remain the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`.

## Predecessor Closeout

`P39-ASSIST-09 Assistance Session Workflow Wiring Contract` is complete through PR `#825`, merge
commit `35a011372eff9b16c879ddadbf7313d92bc48bd1`.

ASSIST-09 shipped the DG09-promoted pure `domain-assistance` intent boundary:

- public workflow-intent contracts over `AssistanceSessionDigest`;
- deterministic readonly intent lists with literal `executionAllowed: false`;
- fail-closed blocker codes for missing identity, consent, disclaimers, country metadata,
  human-review posture, AI non-finality, digest mismatch, side-effect IDs, and recovery activation;
- existing `AssistanceOutcomeKind` and `AssistanceDisclaimerCode` reuse only;
- hash-safe reference keys and scoped evidence pairing by digest pack summary;
- focused unit proof for supported, incomplete, sensitive, AI-assisted, side-effect-attempt, and
  leakage scenarios.

Local proof passed `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate`. Remote proof
passed SonarCloud, unit, static, PR E2E, e2e-gate, Pilot Gate, commitlint, gitleaks, pnpm-audit,
validation-surface, pr-finalizer, and Vercel ignored-build checks before merge.

P39 remains intentionally package-only. It did not authorize runtime Help Now UI, assistance
workflow execution, upload flows, database persistence/RLS, CRM/claim/handoff creation, outbox/event
emission, Professional Recovery activation, autonomous AI workflows, model calls, prompt changes,
proxy/canonical route/auth/tenancy/routing changes, Stripe, README, AGENTS, or broad
architecture-doc changes.

## CRM Resume Inputs

- `P38-DG22 CRM23 And CRM Foundation Closeout` closed the CRM foundation tranche and explicitly
  moved tasks, templates, sequences, scoring, consent, routing audit retention, automated routing
  triggers, external notification fanout, and broader CRM workflow expansion to a later program
  unless future repo-canonical evidence proved pilot necessity.
- `docs/plans/2026-05-13-p38-crm-state-of-art-roadmap.md` ranked CRM tasks ahead of templates,
  sequences, activity channel specializations, scoring, and consent in the product-depth queue.
- `packages/domain-crm` already preserves the correct boundary for CRM expansion: pure domain
  modules, repository ports, typed actor context, append-only history conventions, support-handoff
  lifecycle state, read/write separation, timeline projection, and follow-up next-action derivation.
- The completed assistance lane now provides non-executing workflow intent contracts without
  creating CRM records, so CRM can resume without coupling `domain-assistance` to `domain-crm`.

## Decision

Open `P40 CRM Product Depth`.

Promote exactly one implementation slice:

`P40-CRM24 CRM Task Domain Foundation`

The promoted slice is a pure `packages/domain-crm` contract slice for CRM tasks. It must define the
smallest task aggregate and state-transition boundary needed before task persistence, UI, scheduler,
notifications, templates, sequences, scoring, or assistance-intent execution can be considered.

## Candidate Ranking

| Rank | Candidate                              | Decision | Rationale                                                                                                                     |
| ---- | -------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P40-CRM24 CRM Task Domain Foundation` | Promote  | CRM tasks are the first deferred product-depth item and can be introduced safely as pure domain contracts before runtime use. |
| 2    | Task persistence and agent/staff UI    | Defer    | Persistence and UI need stable task contracts, authorization semantics, and focused user-workflow proof first.                |
| 3    | CRM templates foundation               | Defer    | Templates depend on task/activity semantics and should not be designed before the task boundary exists.                       |
| 4    | CRM sequences or automation            | Defer    | Sequences imply scheduling, notification fanout, failure recovery, and consent controls beyond the next smallest slice.       |
| 5    | Assistance intent execution into CRM   | Reject   | ASSIST-09 intents are not authorization; adapters need separate consent, RLS, audit, idempotency, and rollback proof.         |

## Promoted Slice Scope

Authorized implementation scope for `P40-CRM24`:

- Add pure `packages/domain-crm` task types, constants, repository ports, state-transition helpers,
  and focused unit tests.
- Model task identity, tenant identity, task subject references, actor context, assignment target,
  status, priority, due date, completion/cancellation metadata, and deterministic clock/ID
  injection.
- Support bounded subject references needed by existing CRM foundations, such as lead, deal,
  account, contact, and support-handoff references, without importing web/database modules.
- Define explicit task state transitions such as create, assign/reassign, mark due metadata,
  complete, cancel, and reopen only where a reopen precondition is deterministic.
- Preserve append-only history/output semantics or repository-port expectations for later adapters.
- Reuse existing `domain-crm` actor/context and result patterns where available.
- Add focused tests for valid task creation, invalid tenant/actor/subject combinations, assignment
  authorization shape, due-date normalization, terminal-state blocking, idempotent no-op handling
  where applicable, and PII-safe output.
- Update package exports and repo-size budget only as needed for the bounded package/test delta.

The expected implementation delta should stay package-local. If a later implementation needs web,
database, E2E, scheduler, notification, template, sequence, scoring, or assistance-adapter work,
that must be promoted by a later gate.

## Non-Goals

- Runtime UI on `/agent`, `/staff`, `/admin`, `/member`, `/agent/crm`, or lead-detail surfaces.
- Database schema, migrations, RLS, Drizzle adapters, backfills, or persistence.
- Scheduler, cron, due-task runner, notification fanout, outbox worker, email, SMS, WhatsApp, or
  push behavior.
- CRM templates, sequences, scoring, consent/preference implementation, routing audit retention, or
  automated routing triggers.
- Assistance-session intent execution, CRM lead creation from assistance, claim creation,
  support-handoff creation, Professional Recovery activation, billing, finance, agreement, or POA
  workflows.
- Proxy, canonical route, auth/session layering, tenancy architecture, routing architecture, Stripe,
  README, AGENTS, or broad architecture-doc changes.

## Acceptance Criteria

- `P40-CRM24` exposes public, typed, deterministic CRM task domain contracts from
  `packages/domain-crm`.
- Task mutations fail closed for missing or mismatched tenant/actor/subject state.
- Terminal-state and assignment transitions are explicit and covered by focused unit tests.
- Outputs are PII-safe and do not embed raw lead, member, claim, insurer, medical, or legal text.
- The implementation remains SQL-free, route-free, UI-free, scheduler-free, notification-free, and
  independent of `domain-assistance`.
- No proxy, canonical route, auth, tenancy, schema/RLS, Stripe, README, AGENTS, or broad
  architecture-doc change is included.

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

## Boundaries Preserved

This gate does not authorize or perform:

- `apps/web/src/proxy.ts` changes;
- canonical route renames or bypasses;
- auth/session layering, tenancy architecture, routing architecture, or domain architecture
  refactors;
- Stripe reintroduction;
- runtime UI, database, RLS, scheduler, notification, outbox worker, or automation work;
- direct coupling between `domain-assistance` and `domain-crm`;
- README, AGENTS.md, or broad architecture-doc edits.
