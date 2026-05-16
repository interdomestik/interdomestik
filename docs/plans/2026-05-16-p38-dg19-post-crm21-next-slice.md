# P38-DG19 Post-CRM21 Next Slice Selection

Status: complete
Slice: `P38-DG19`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-16
Authority: completed design gate. This document promotes exactly one implementation slice.
Recommended implementation slice: `P38-CRM08 Routing Persistence And Cursor Adapter`
Promoted implementation slice: `P38-CRM08 Routing Persistence And Cursor Adapter`

Status vocabulary: `review_draft` records a design awaiting reviewer approval; `complete` records an
approved design gate that may promote exactly one implementation slice. Tracker queue statuses remain
the repo-audited values `completed`, `in_progress`, `pending`, and `blocked`; this design uses
`deferred` only as prose for non-promoted candidates, not as a tracker status.

DG19 ships as `complete` without a separate `review_draft` branch because DG05 already approved the
CRM routing domain contract and explicitly reserved CRM08 for persistence behind the existing
`packages/domain-crm/src/routing/` ports. This gate does not introduce a new routing algorithm or UI
contract; it tightens the persistence, migration, RLS, and concurrency contract required before CRM08
implementation starts.

## Status / Predecessor Closeout

`P38-CRM21 Visual Regression Baseline Infrastructure` is complete through PR `#783`, merge commit
`e2ab25f2ab995145528387cee9c181d93946e24e`. The closeout sync landed through PR `#784`, merge
commit `bcb6079341eb02de6101b1f90ef9013683f505c2`, and recorded Notion sync at
`https://www.notion.so/362036cff1f88115bae2fdd14a5e1d32`.

P38 now has:

- Domain CRM foundation modules for accounts/contacts/conversion, pipelines/deals, dedupe, and routing
  selection (`P38-CRM01` through `P38-CRM07`).
- Durable pipeline/deal persistence and reporting/snapshot operations across agent/admin/staff CRM
  reporting surfaces (`P38-CRM04` through `P38-CRM22`).
- Opt-in Linux/Chromium CRM visual baselines for the reporting surfaces (`P38-CRM21`).

The remaining reserved P38 CRM correctness gap is routing persistence. CRM07 provides the pure
`selectCrmLeadAssignee` contract and repository ports, but routing rules, cursor compare-and-swap
advancement, and assignment audit rows are not yet persisted.

## Decision

Promote exactly one bounded implementation candidate:

`P38-CRM08 Routing Persistence And Cursor Adapter`

CRM08 should add the smallest durable persistence layer needed to support CRM07 routing rules and
cursor safety, without introducing new UI, new routes, or automatic lead reassignment in the first
slice.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | `P38-CRM08 Routing Persistence And Cursor Adapter` | Promote. Required to make CRM07 cursor advancement and auditability durable.            |
| 2    | `P38-CRM09 Routing Admin UX And Rule Management`   | Defer. Depends on CRM08 persistence and benefits from already-landed CRM visual proof.  |
| 3    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Independent cleanup; keep blocked behind explicit deprecation and read parity.   |
| 4    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null proof and explicit quarantine/backfill discipline. |

## Source Inputs

- `docs/plans/2026-05-14-p38-dg05-lead-routing-design.md` (CRM07 risks + CRM08 reserved schema set).
- `packages/domain-crm/src/routing/*` (CRM07 repository ports, routing decisions, and event contract).
- `packages/domain-crm/src/outbox/*` (typed `crm.lead.routed` event and outbox port contract).
- `packages/database/src/schema/crm.ts`, `packages/database/drizzle/0062_careful_gideon.sql`, and
  `packages/database/drizzle/0063_clean_serpent_society.sql` (CRM04/CRM05 composite tenant FK,
  index, CHECK, and RLS patterns).
- `docs/plans/current-program.md` and `docs/plans/current-tracker.md` (repo-canonical P38 status).

## Implementation Scope For P38-CRM08

Allowed:

- Add durable persistence for routing rules, routing cursors, and routing assignment audit history,
  scoped by tenant and, when applicable, branch.
- Add app-side SQL adapters under `apps/web/src/lib/domain-crm/` that implement the exact CRM07
  `CrmRoutingRepository` ports:
  - `listRoutingRules`
  - `advanceRoutingCursor`
  - `appendRoutingAssignmentAudit`
- Preserve CRM07 exported port names and result shapes. CRM08 must not add new repository methods or
  change `CrmRoutingRepository` unless the existing CRM07 contract already requires it.
- Add focused unit/adapter proof mirroring the CRM04/CRM05 adapter discipline: tenant scoping, branch
  scoping, idempotency behavior, and cursor conflict behavior.
- Add Drizzle schema, generated migrations, migration journal updates, and RLS policies for the new
  tables, mirroring the `crm_deals`, `crm_deal_stage_history`, and `crm_pipeline_snapshots` tenant
  isolation style.
- Update `scripts/ci/db-access-baseline.json` for new CRM08 SQL query patterns or document in the PR
  why the guard baseline does not change.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical route names, route authority, auth/session layering, or tenant isolation architecture.
- New UI surfaces for routing, new admin CRUD flows, or automatic routing on lead creation.
- Non-routing CRM schema tightening/cleanup, Stripe work, README, AGENTS.md, or broad architecture
  docs.

## Nullability Plan

CRM08 must pin column nullability in the implementation PR. No implementation decision should be left
implicit.

| Table                           | NOT NULL columns                                                                                                                 | Nullable columns                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `crm_routing_rules`             | `id`, `tenant_id`, `strategy`, `enabled`, `priority`, `agent_pool`, `created_at`, `updated_at`                                   | `branch_id`, `source`, `lead_type`, `utm_source`, `utm_medium`, `utm_campaign`, `effective_from`, `effective_to`, `archived_at`      |
| `crm_routing_cursors`           | `tenant_id`, `rule_id`, `cursor_value`, `updated_at`                                                                             | `last_idempotency_key` if the implementation uses cursor-level idempotency storage                                                   |
| `crm_routing_assignments_audit` | `id`, `tenant_id`, `lead_id`, `rule_id`, `actor_id`, `selected_agent_id`, `strategy`, `reason_code`, `occurred_at`, `created_at` | `branch_id`, `idempotency_key`, optional structured `metadata` only if needed for the existing CRM07 audit/event payload without PII |

`actor_id` and `selected_agent_id` are non-null in the first slice because CRM07
`CrmRoutingAssignmentAuditRecord` already requires `actorId` and `agentId`. If a future automated
system actor needs nullable actor semantics, it requires a later coordinated domain-contract gate.

## Persistence Contract

The implementation must pin these database-level contracts. Anything not explicitly authorized here
or in Implementation Scope is covered by Non-Goals.

| Invariant                                                                                      | Enforcement layer                                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Routing rules are tenant-scoped and optionally branch-scoped.                                  | DB columns plus adapter filters on `tenant_id` and authorized `branch_id`.                         |
| Archived rules are hidden from `listRoutingRules` by default.                                  | Adapter query filters plus `crm_routing_rules (tenant_id, archived_at) where archived_at is null`. |
| Routing strategy is one of `round_robin`, `least_loaded`, or `manual_only`.                    | DB CHECK mirroring `CrmRoutingStrategy`.                                                           |
| Rule priority is non-negative.                                                                 | DB CHECK `priority >= 0`.                                                                          |
| Routing cursors belong to exactly one rule in the same tenant.                                 | Composite FK `(tenant_id, rule_id)` to `crm_routing_rules (tenant_id, id)`.                        |
| Cursor advancement never double-advances the same prior cursor under concurrent writers.       | Adapter compare-and-swap `UPDATE ... WHERE cursor_value = $priorCursor`.                           |
| Assignment audit rows are append-only.                                                         | Application discipline; no update/delete path in the adapter.                                      |
| Assignment audit idempotency suppresses duplicate rows for retrying the same routing decision. | Partial unique index on `(tenant_id, idempotency_key)` where `idempotency_key is not null`.        |
| Tenant isolation on every new reference is explicit.                                           | Composite unique `(tenant_id, id)` on routing rules and composite FKs for tenant-bearing refs.     |
| CRM08 persists only the three CRM07 strategies.                                                | DB CHECK plus adapter/domain validation; deferred strategies require a later schema PR.            |

Table shape:

- `crm_routing_rules`
  - Columns: `id`, `tenant_id`, nullable `branch_id`, `source`, `lead_type`, `utm_source`,
    `utm_medium`, `utm_campaign`, nullable `effective_from`, nullable `effective_to`, `strategy`,
    `enabled`, `priority`, `agent_pool jsonb`, nullable max-lead cap fields if needed to map
    `CrmRoutingRule`, nullable `archived_at`, `created_at`, and `updated_at`.
  - Adds unique `(tenant_id, id)`.
  - Branch references must use tenant-safe branch discipline when both sides carry tenant identity.
- `crm_routing_cursors`
  - Columns: `tenant_id`, `rule_id`, `cursor_value`, optional `last_idempotency_key`, and
    `updated_at`.
  - Adds unique `(tenant_id, rule_id)`.
  - `rule_id` must use a composite FK to `crm_routing_rules (tenant_id, id)`.
- `crm_routing_assignments_audit`
  - Columns: `id`, `tenant_id`, `lead_id`, `rule_id`, `actor_id`, `selected_agent_id`, nullable
    `branch_id`, `strategy`, `reason_code`, nullable `idempotency_key`, `occurred_at`, and
    `created_at`.
  - `rule_id` must use a composite FK to `crm_routing_rules (tenant_id, id)`.
  - `lead_id` must be tenant-scoped in adapter predicates; add a composite tenant FK if the current
    CRM lead schema exposes `(tenant_id, id)` for `crm_leads`.

Foreign-key and lifecycle policy:

- `crm_routing_rules` is archive-only in CRM08. Hard delete is not part of the adapter contract.
- `crm_routing_cursors -> crm_routing_rules`: `ON DELETE CASCADE` is acceptable only for accidental
  hard-delete cleanup, but adapters must archive rules rather than delete them.
- `crm_routing_assignments_audit -> crm_routing_rules`: `ON DELETE RESTRICT` or the generated
  Postgres `NO ACTION` equivalent for audit immutability.
- `crm_routing_assignments_audit -> crm_leads`: `ON DELETE RESTRICT` or `NO ACTION`; audit rows must
  not disappear when lead ownership changes.
- Composite tenant FKs are required wherever both sides carry `tenant_id`.

## Index Plan

CRM08 must add or document these indexes:

- `crm_routing_rules (tenant_id, branch_id, enabled, priority)` for rule listing.
- Partial `crm_routing_rules (tenant_id, archived_at) where archived_at is null` for archive-aware
  rule reads.
- Unique `crm_routing_rules (tenant_id, id)` for composite tenant references.
- Unique `crm_routing_cursors (tenant_id, rule_id)` for the compare-and-swap key.
- `crm_routing_assignments_audit (tenant_id, lead_id, occurred_at)` for per-lead audit reads.
- `crm_routing_assignments_audit (tenant_id, rule_id, occurred_at)` for per-rule audit reads.
- Partial unique `crm_routing_assignments_audit (tenant_id, idempotency_key) where idempotency_key is
not null` for retry-safe audit append.

## Cursor Concurrency Contract

CRM08 must preserve the existing CRM07 repository result shape:

```ts
type CrmRoutingCursorAdvanceResult =
  | { success: true; advancement: CrmRoutingCursorAdvancement }
  | { success: false; reason: 'cursor_conflict' };
```

`advanceRoutingCursor` must implement the conflict branch with a compare-and-swap update on
`(tenant_id, rule_id, cursor_value)`. On conflict, the application service that applies a routing
decision must reload the current cursor state, rerun `selectCrmLeadAssignee`, and retry at most three
times. After the retry budget is exhausted, it must stop assignment and surface manual review using
the existing CRM07 manual-review vocabulary, not silently assign, fail open, or retry forever.

## Outbox And Ownership-History Boundary

CRM07 already includes the typed `crm.lead.routed` domain event. CRM08 must not drop that event when a
routing assignment is applied. The implementation must either enqueue `crm.lead.routed` through the
existing `CrmOutboxPort` in the same application service that writes the assignment audit, or, if no
durable app-side outbox adapter exists for that service yet, return the typed event to the caller and
record the explicit non-durable event-boundary rationale in the PR notes. CRM08 must not create a new
outbox table, worker, scheduler, or external notification path.

`crm_routing_assignments_audit` and `crm_lead_ownership_history` are independent tables:

- routing audit records the routing decision, rule, strategy, selected agent, reason, actor, and
  occurred-at time;
- ownership history records the applied ownership interval and transfer lifecycle;
- CRM08 must not merge the tables or replace `transferCrmLeadOwnership` history semantics.

## Acceptance Criteria

- `P38-CRM08` adds the three routing persistence tables with the pinned table shape, nullability,
  indexes, CHECK constraints, composite tenant references, and RLS policies.
- RLS mirrors the existing CRM tenant-isolation pattern used by `crm_deals`,
  `crm_deal_stage_history`, and `crm_pipeline_snapshots`, and is covered by a smoke test or focused
  adapter proof.
- App-side SQL adapters implement the exact CRM07 `CrmRoutingRepository` ports:
  `listRoutingRules`, `advanceRoutingCursor`, and `appendRoutingAssignmentAudit`.
- Adapter tests cover every introduced `success`, `cursor_conflict`, `not_found`, and `forbidden`
  branch that the app-side adapter exposes.
- Cross-tenant and cross-branch reads/writes are rejected or hidden according to existing CRM adapter
  discipline.
- Cursor compare-and-swap behavior is covered by a concurrency test that proves the second writer
  receives `cursor_conflict`.
- Audit idempotency proves duplicate inserts under the same non-null idempotency key are no-ops or
  return the existing audit row.
- `crm.lead.routed` is preserved through the existing typed event/outbox boundary without adding new
  event infrastructure.
- `pnpm db:migrations:check-journal` and `pnpm check:db-access` pass; any db-access baseline change
  is included or explicitly justified.
- No SQL or `drizzle-orm` imports appear under `packages/domain-crm/src`.
- No web UI, proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad
  architecture-doc changes appear in the slice.

## Coverage Discipline

Every adapter branch introduced by CRM08 must have dedicated proof. Tenant-isolation tests must use
same-id or same-rule-shaped cross-tenant fixtures where practical so accidental tenant omission would
fail the test. Branch-scope tests must prove a branch-scoped actor cannot see or advance another
branch's routing rule or cursor.

Concurrency proof must simulate two `advanceRoutingCursor` calls against the same prior cursor and
prove only one advances. Idempotency proof must show that retrying
`appendRoutingAssignmentAudit` with the same non-null idempotency key does not append a duplicate row.
The first implementation slice does not need UI E2E, routing admin UX, automatic lead-assignment
flows, external notification proof, retention jobs, or all-tenant fleet routing tests.

## Risks And Open Questions

- **Cursor conflict storms.** High lead-creation volume could create repeated round-robin conflicts.
  CRM08 accepts a bounded retry budget and defers scale-specific routing work to a later gate.
- **Audit table growth.** Routing audit rows can grow without bound. Reserve a later retention slice;
  CRM08 should not add retention jobs.
- **RLS drift.** New tables can be over- or under-restricted. Mitigation: mirror existing CRM RLS
  policies and add focused smoke/adapter proof.
- **Strategy expansion.** `weighted_round_robin`, `sticky_account`, `territory`, and
  `first_available` remain deferred CRM07 strategy names, not CRM08 persisted strategy values.
  Future strategies require a coordinated schema/domain PR.
- **Manual override pathway.** Manual override routing remains a CRM07 manual-review posture and does
  not become a CRM08 assignment or ownership-transfer pathway.
- **Outbox durability.** The typed event exists, but CRM08 must not invent new outbox infrastructure.
  Any non-durable event handoff must be explicit in the PR.

## Dependency / Sequencing

CRM08 depends on:

- `P38-CRM07 Lead Routing Domain Foundation`, which provides `selectCrmLeadAssignee`,
  `CrmRoutingRepository`, `CrmRoutingRule`, cursor advancement, audit record, and
  `crm.lead.routed` contracts.
- `P38-CRM04 Pipeline And Deal Persistence`, which established the current CRM persistence pattern
  for additive migrations, composite tenant FKs, RLS, indexes, and adapter proof.
- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`, which established the current append-only
  CRM operational persistence and snapshot discipline.

CRM08 unblocks:

- `P38-CRM09 Routing Admin UX And Rule Management`.
- Future controlled routing application-service slices that may apply routing decisions to lead
  ownership after persistence and auditability are proven.
- Future routing audit reporting and retention work.

CRM08 does not depend on CRM21 visual baselines from a domain perspective, but CRM21 is now complete
and reduces risk for later admin-facing CRM UI work.

## Non-Goals

- No routing admin UX, rule-management UI, or new routes.
- No automatic routing on lead creation.
- No ownership-transfer semantics beyond existing `transferCrmLeadOwnership`.
- No outbox table, outbox worker, scheduler, external alerting, or notification fanout.
- No `crm_lead_ownership_history` redesign.
- No legacy deal cleanup, CRM04 nullability tightening, or CRM11 work.
- No proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc
  changes.

## Promotion Boundary

This design gate promotes `P38-CRM08` only. It does not promote:

- `P38-CRM09` routing admin UX and rule management.
- Any agent/staff/admin UI or automatic lead assignment flows.
- Any changes to CRM lead ownership transfer semantics beyond existing `transferCrmLeadOwnership`.
- `P38-CRM25 Routing Audit Retention`, which is reserved as a future bounded retention slice.

## Approval Bar

DG19 should be approved only if reviewers agree that:

- CRM08 is additive persistence behind already-approved CRM07 routing ports.
- The persistence contract has explicit nullability, indexes, CHECK constraints, composite tenant
  references, RLS, and cascade/lifecycle policy.
- Cursor compare-and-swap conflict behavior is tested and bounded by a retry budget.
- Routing audit rows are append-only, idempotent, and distinct from ownership history.
- The typed `crm.lead.routed` event is preserved without introducing new event infrastructure.
- No UI, automatic routing, proxy, canonical-route, auth, tenancy, Stripe, README, AGENTS, or broad
  architecture-doc scope enters CRM08.

## Promotion / Sign-off

| Slice                                              | Status   | Authority                 | Notes                                                               |
| -------------------------------------------------- | -------- | ------------------------- | ------------------------------------------------------------------- |
| `P38-CRM05 Reporting Read-Models And Forecasts`    | complete | PR `#756`                 | Durable reporting and forecast snapshot substrate is landed.        |
| `P38-CRM12 Agent Reporting Dashboard`              | complete | repo-canonical tracker    | Agent reporting surface is complete.                                |
| `P38-CRM13 Staff Reporting Dashboard`              | complete | repo-canonical tracker    | Staff reporting surface is complete.                                |
| `P38-CRM14 Forecast Snapshot Observability`        | complete | repo-canonical tracker    | Observability widget substrate is complete.                         |
| `P38-CRM15 Forecast Snapshot Backfill`             | complete | repo-canonical tracker    | Backfill core is complete.                                          |
| `P38-CRM16 Forecast Backfill Operator UX`          | complete | repo-canonical tracker    | Operator UX is complete.                                            |
| `P38-CRM18 Forecast Observability Contract`        | complete | repo-canonical tracker    | CRM18 observability contract is complete.                           |
| `P38-CRM19 Forecast Snapshot Backfill Runner`      | complete | repo-canonical tracker    | Backfill runner is complete.                                        |
| `P38-CRM20 Branch Manager Reporting View`          | complete | repo-canonical tracker    | Branch-manager reporting view is complete.                          |
| `P38-CRM21 Visual Regression Baseline`             | complete | PR `#783` / PR `#784`     | Visual baseline and closeout sync are complete.                     |
| `P38-CRM22 Forecast Snapshot Alerting`             | complete | PR `#778`                 | Forecast alerting is complete.                                      |
| `P38-CRM06 Dedupe Domain Foundation`               | complete | parallel-track context    | Completed dedupe context; not a CRM08 blocker.                      |
| `P38-CRM07 Lead Routing Domain Foundation`         | complete | PR `#751`                 | Required CRM08 predecessor and existing routing contract authority. |
| `P38-CRM08 Routing Persistence And Cursor Adapter` | promoted | `P38-DG19`                | Add routing rules, cursors, audit persistence, RLS, and adapters.   |
| `P38-CRM09 Routing Admin UX And Rule Management`   | reserved | post-routing-persistence  | Requires CRM08 durable persistence first.                           |
| `P38-CRM10 Legacy Deal Column Retirement`          | reserved | post-normalized-readers   | Independent cleanup, not selected here.                             |
| `P38-CRM11 Deal Nullability Tightening`            | reserved | post-zero-null-proof      | Requires production zero-null/backfill confidence.                  |
| `P38-CRM25 Routing Audit Retention`                | reserved | post-routing-audit-growth | Future retention/quarantine gate for routing audit growth.          |

## Verification Plan

Design-gate PR proof:

```bash
git diff --check
pnpm plan:status
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm ci:local:quick
```

`pnpm plan:status` renders the canonical current-program/current-tracker status and catches status
vocabulary drift. `pnpm ci:local:quick` is the local CI-parity quick lane used before docs/design PR
readiness in this automation workflow.

Implementation PR proof after CRM08 starts:

```bash
pnpm db:generate
pnpm db:migrations:check-journal
pnpm check:db-access
pnpm --filter @interdomestik/database type-check
pnpm --filter @interdomestik/domain-crm test:unit
pnpm --filter @interdomestik/domain-crm type-check
pnpm --filter @interdomestik/web test:unit --run src/lib/domain-crm
pnpm --filter @interdomestik/web type-check
pnpm --filter @interdomestik/web lint
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
git diff --check
pnpm verify-slice -- --static
pnpm ci:local:pr
```

The implementation PR should run `interdomestik_qa.scope_audit` with allowed paths limited to:

- `packages/database/src/schema/`
- `packages/database/drizzle/`
- `apps/web/src/lib/domain-crm/`
- `scripts/ci/db-access-baseline.json`, only if `pnpm check:db-access` requires it
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`

Forbidden paths should include `apps/web/src/proxy.ts`, product UI routes/components, auth/session
architecture, tenancy architecture, Stripe, README, AGENTS.md, and broad architecture docs unless a
later review explicitly authorizes a narrow exception.
