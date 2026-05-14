# P38-DG05 Lead Routing Design After Dedupe Foundation

Status: `design-review`  
Date: `2026-05-14`  
Slice: `P38-DG05`  
Owner: `platform + product + qa`  
Phase: `Phase C`

## Status / Predecessor Closeout

`P38-CRM06 Lead Dedupe Domain Foundation` is complete through PR `#750`, merge commit
`c7412618c9f55adf85a75d8f06d7b5de51961254`.

The stale live-tracker state that still showed `P38-CRM06` as in progress is closed by this
docs-only gate. This gate makes no runtime, schema, SQL-adapter, web-flow, routing, proxy,
canonical-route, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc changes.

## Decision

The next bounded implementation slice is:

`P38-CRM07 Lead Routing Domain Foundation`

This gate promotes routing now because CRM06 provides the duplicate-candidate and merge-state
contract that routing needed before ownership assignment became prescriptive. `P38-CRM04 Pipeline
And Deal Persistence` and `P38-CRM05 Reporting Read-Models And Forecast Snapshots` remain reserved
and valid, but this gate consumes the explicit DG04 dedupe-to-routing dependency first.

Routing before pipeline persistence is an intentional trade-off: routing consumes only lead identity,
branch, source, lead type, workload, and dedupe state, all already available as domain snapshots.
Pipeline persistence remains important for dashboard professionalism, but it is a schema/adapter
slice. CRM07 can stay domain-only and reduce assignment ambiguity without racing the persistence
work.

## Inputs

| Input                      | Relevance                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#750` / `P38-CRM06`    | Added pure lead identity normalization, candidate scoring, candidate listing, explicit merge contracts, merge history, aggregate policy, and `crm.lead.merged` event support.          |
| DG04 routing deferral      | DG04 intentionally deferred routing until dedupe existed so assignment rules would not amplify duplicate or merge-pending lead rows.                                                   |
| Existing ownership history | `crmLeadOwnershipHistory` and the domain ownership-transfer model already prove append-only custody patterns, but no rules engine selects the next owner.                              |
| Existing actor context     | `CrmActorContext` already carries tenant, role, agent, and branch scope and should remain the authorization boundary for routing decisions.                                            |
| P38 roadmap reservation    | `P38-CRM04` and `P38-CRM05` remain reserved for pipeline/deal persistence and reporting; routing proceeds only as the dedupe-dependent P0 branch, not as a replacement for those rows. |

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                                                                                                       |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P38-CRM07 Lead Routing Domain Foundation`         | Promote now. It is the smallest next slice unlocked directly by CRM06 and can stay domain-only with pure assignment selection plus audit contracts.                            |
| 2    | `P38-CRM04 Pipeline And Deal Persistence`          | Keep reserved. Still important for dashboard credibility, but it is a persistence/schema slice and should proceed after a dedicated persistence design or implementation pass. |
| 3    | `P38-CRM05 Reporting Read-Models And Forecasts`    | Keep reserved. Reporting is still blocked by pipeline/deal persistence and should not race ahead of durable stage/deal storage.                                                |
| 4    | Tasks, templates, sequences, activity channels     | Defer. These are P1 product-depth slices and should follow the P0 foundations.                                                                                                 |
| 5    | Scoring, consent, external IDs, enrichment, search | Defer. These depend on richer CRM data and clearer outbound policy surfaces.                                                                                                   |

## Promoted Slice

`P38-CRM07 Lead Routing Domain Foundation`

Implementation scope:

- Add `packages/domain-crm/src/routing`.
- Define routing-rule, explicit agent-pool, workload-snapshot, cursor, assignment-decision, and
  audit-record domain types.
- Define `CrmRoutingStrategy = 'round_robin' | 'least_loaded' | 'manual_only'`.
- Define pure `selectCrmLeadAssignee(input, ruleset, workloadSnapshot, cursors)` logic.
- Gate routing decisions on tenant, branch, source, lead type, actor scope, lead eligibility, and
  dedupe status.
- Refuse automated assignment for archived, converted, already-merged, closed, or merge-pending
  leads.
- Return typed success/error results with explicit denial and invalid-state reasons.
- Declare repository ports for reading routing rules, compare-and-swap cursor advancement, and
  appending routing-assignment audit records; the first slice may keep persistence adapter
  implementation out of scope.
- Add `crm.lead.routed` to the typed CRM domain-event union with a type-level regression test.
- Add in-memory unit proof for rule matching, strategy selection, cursor advancement output,
  workload tie-breaking, manual-only behavior, authorization, lead-state rejection, dedupe-state
  rejection, idempotency-key reservation, and audit/event-output shape.

Allowed touch points:

- `packages/domain-crm/src/routing/**`.
- `packages/domain-crm/src/outbox/**` only for the typed `crm.lead.routed` event.
- `packages/domain-crm/src/index.ts` and `packages/domain-crm/package.json` for exports.
- Focused `packages/domain-crm` tests.
- `docs/plans/**` for proof and tracker/program state.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical `/member`, `/agent`, `/staff`, or `/admin` routes.
- Auth provider layering, session shape, or tenancy architecture.
- Database schema, migrations, Drizzle table definitions, SQL adapters, or route/server actions.
- Web UI, dashboards, lead-list banners, assignment controls, or notification fanout.
- Pipeline/deal persistence, reporting read-models, tasks, templates, sequences, scoring, consent,
  enrichment, search, retention, automation, or broad CRM redesign.
- Stripe, README, AGENTS, or broad architecture docs.

## Domain Contract

The implementation must pin these concepts:

```ts
type CrmRoutingStrategy = 'round_robin' | 'least_loaded' | 'manual_only';

type CrmRoutingDeferredStrategy =
  | 'sticky_account'
  | 'territory'
  | 'weighted_round_robin'
  | 'first_available';

type CrmRoutingDedupeState = 'clean' | 'merge_pending' | 'merged_loser' | 'merged_winner';

type CrmRoutingAssignmentDecision =
  | {
      outcome: 'assigned';
      agentId: string;
      ruleId: string;
      strategy: CrmRoutingStrategy;
      auditRecord: CrmRoutingAssignmentAuditRecord;
      event: CrmLeadRoutedEventData;
      cursorAdvancement?: CrmRoutingCursorAdvancement;
    }
  | {
      outcome: 'manual_review';
      ruleId?: string;
      reason: CrmRoutingManualReviewReason;
    }
  | {
      outcome: 'no_rule';
    }
  | {
      outcome: 'rejected';
      reason: CrmRoutingRejectionReason;
    };
```

`CrmRoutingRule` first-slice fields:

- `id`, `tenantId`, optional `branchId`.
- Match axes: `source`, `leadType`, optional `utmSource`, optional `utmMedium`, optional
  `utmCampaign`.
- `strategy`, `priority`, `enabled`.
- Explicit ordered `agentIds: readonly string[]`; pool resolver ports are deferred.
- Optional capacity caps: `maxOpenLeadsPerAgent`, `maxNewLeadsPerAgentPerDay`.
- Effective-date window: optional `effectiveFrom`, optional `effectiveTo`.
- Optional fallback: `fallbackAgentId`, optional `fallbackRuleId`.

Deferred rule axes are named but out of scope for CRM07: day-of-week and business-hour windows,
geographic territory matching, postal-code and timezone matching, skill/tag matching, language
matching, dynamic pool resolver ports, and rule-admin UI.

`selectCrmLeadAssignee` signature:

```ts
function selectCrmLeadAssignee(
  input: {
    actor: CrmActorContext;
    lead: CrmRoutingLeadSnapshot;
    override?: CrmRoutingManualOverride;
    now: string;
    idempotencyKey?: string;
  },
  ruleset: readonly CrmRoutingRule[],
  workloadSnapshot: CrmRoutingWorkloadSnapshot,
  cursors: CrmRoutingCursorMap
): CrmRoutingAssignmentDecision;
```

The selector is advisory and never writes ownership history. A caller that accepts an assigned
decision must invoke the existing `transferCrmLeadOwnership` path with the routing decision attached
as reason/audit context. CRM07 must not create a second ownership-history writer.

### Cursor Advancement

Round-robin selection must be concurrency-safe at the contract boundary. The pure selector returns a
`CrmRoutingCursorAdvancement` value:

```ts
type CrmRoutingCursorAdvancement = {
  ruleId: string;
  priorCursor: string | null;
  nextCursor: string;
  agentId: string;
};
```

The repository port must apply this by compare-and-swap semantics, for example
`advanceRoutingCursor(advancement, { idempotencyKey })`. If the compare-and-swap fails, the adapter
or caller retries with a fresh cursor map. The domain module must not mutate process-local globals or
hide cursor state in a stateful service.

### Workload Snapshot

`CrmRoutingWorkloadSnapshot` is supplied by the caller to preserve selector purity. It is keyed by
agent id and must include:

- Open leads in non-terminal stages.
- New leads assigned today.
- Open follow-ups.
- Optional `capacityState: 'available' | 'at_capacity' | 'pto' | 'offline'`.
- `snapshotAt`.

The selector rejects stale workload snapshots with `reason: 'stale_workload_snapshot'` when
`snapshotAt` is more than `CRM_ROUTING_WORKLOAD_MAX_AGE_MINUTES` before `input.now`. The exported
constant should default to `15`.

### Dedupe State

`CrmRoutingLeadSnapshot.dedupeState` is explicit:

- `clean`: eligible if all other checks pass.
- `merged_winner`: eligible if all other checks pass.
- `merge_pending`: rejected with `reason: 'dedupe_state'`.
- `merged_loser`: rejected with `reason: 'dedupe_state'`.

### Manual Paths

`manual_only` remains part of `CrmRoutingStrategy`; it matches a rule but always returns
`outcome: 'manual_review'`. It must not emit `crm.lead.routed`, produce cursor advancement, or append
an assignment audit record.

Manual override is reserved but not executed by CRM07. `CrmRoutingManualOverride` may be present on
the input shape only to return `manual_review` with `reason: 'manual_override_direct_transfer'`,
instructing callers to use `transferCrmLeadOwnership` directly.

### Rule Administration

CRM07 may define repository ports for rules but does not implement rule CRUD. Rule administration is
deferred to `P38-CRM09 Routing Admin UX And Rule Management`. The future authorization rule is:
tenant admins may administer tenant-wide rules; branch managers may administer branch-scoped rules
for their branch only.

### Event Contract

CRM07 must extend `CrmDomainEvent` with:

```ts
type CrmLeadRoutedEventData = {
  leadId: string;
  ruleId: string;
  strategy: CrmRoutingStrategy;
  agentId: string;
  fromAgentId?: string | null;
  branchId?: string | null;
  reasonCode: 'rule_match' | 'fallback_agent' | 'fallback_rule';
  idempotencyKey?: string;
};
```

The event name is `crm.lead.routed`. The implementation must add a type-level regression test so
existing `CrmDomainEvent` variants remain backward-compatible.

Typed rejection reasons must cover at least `tenant_scope`, `branch_scope`, `role_scope`,
`lead_state`, `dedupe_state`, `no_matching_rule`, `empty_agent_pool`, `capacity`,
`stale_workload_snapshot`, `cursor_conflict`, and `invalid_override`.

Repository ports that append routing audit records must reserve `idempotencyKey?: string`.

## Acceptance Criteria For P38-CRM07

- `packages/domain-crm` exports routing types, repository ports, pure selection logic, and tests.
- Rule matching is deterministic by tenant, branch, source, lead type, UTM filters, effective window,
  enabled state, and priority.
- `manual_only` never assigns automatically and returns a manual-review decision.
- `round_robin` picks the next eligible pool member from injected cursor state and returns
  `CrmRoutingCursorAdvancement`.
- `least_loaded` picks the eligible agent with lowest eligible workload and deterministic
  tie-breaking.
- Ineligible leads are rejected before assignment, including archived, converted, closed,
  already-merged, and merge-pending leads.
- Dedupe-aware rejection prevents assigning leads that require merge review.
- Authorization uses `CrmActorContext` and returns typed denial reasons.
- Successful decisions produce an audit-ready routing-assignment record with actor, tenant, branch,
  lead, selected agent, rule, strategy, reason, occurred-at timestamp, and optional idempotency key.
- Successful assigned decisions produce a `crm.lead.routed` event payload.
- Failure and manual-review paths append no assignment audit output and emit no event.
- No SQL, `drizzle-orm`, web route, proxy, schema, migration, or UI code appears in the slice.

### Coverage Discipline

Every `assigned`, `manual_review`, `no_rule`, and `rejected` branch must have a dedicated test.
Every `CrmRoutingRejectionReason` variant added in CRM07 must have at least one test. Cursor
advancement, stale workload snapshots, dedupe-state rejection, capacity rejection, no-rule handling,
empty-pool handling, manual-only behavior, and event union regression are required test cases.

## Verification Plan

Focused implementation proof:

- `pnpm --filter @interdomestik/domain-crm test:unit --run src/routing/index.test.ts`
- `pnpm --filter @interdomestik/domain-crm test:unit`
- `pnpm --filter @interdomestik/domain-crm type-check`
- `pnpm exec tsc --noEmit -p packages/domain-crm/tsconfig.json`
- `pnpm exec prettier --check packages/domain-crm/package.json packages/domain-crm/src/index.ts 'packages/domain-crm/src/{routing,outbox}/**/*.ts'`
- `interdomestik_qa.scope_audit` with allowed paths limited to `packages/domain-crm` and
  `docs/plans`.

Required proof before implementation PR merge:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- PR comments, Copilot comments, Sonar, and CI must be inspected and fixed before merge.

## Risks And Deferred Decisions

- **Cursor concurrency.** Round-robin cannot be made safe by a pure function alone. CRM07 returns
  cursor advancement data and requires a future adapter compare-and-swap write.
- **Stale workload snapshots.** The selector rejects snapshots older than the exported max-age
  constant; real-time workload feeds are deferred.
- **Sticky account and territory routing.** Both are common CRM strategies but require account
  ownership and geography contracts. They are named deferred strategies, not silently omitted.
- **Fallback behavior.** CRM07 supports fallback agent or fallback rule in the type contract, but
  full operational policy and UI configuration are deferred.
- **Manual overrides.** First-slice routing is advisory. Manual assignment continues through
  `transferCrmLeadOwnership`.
- **Rule administration.** CRUD and role-scoped rule management are deferred to CRM09.

## Dependency / Sequencing

This slice unblocks:

- `P38-CRM08 Routing Persistence And Cursor Adapter`, which can add `crm_routing_rules`,
  `crm_routing_cursors`, and `crm_routing_assignments_audit` with compare-and-swap cursor writes.
- `P38-CRM09 Routing Admin UX And Rule Management`, which can expose rule CRUD, branch-scoped admin
  authorization, capacity settings, and explicit manual override paths.
- A future agent lead auto-assignment flow that invokes `selectCrmLeadAssignee`, applies cursor
  advancement, then calls `transferCrmLeadOwnership`.
- Future PTO/capacity admin, pool resolver, sticky-account, and territory-routing slices.

The reserved near-term numbering is:

- `P38-CRM04 Pipeline And Deal Persistence`.
- `P38-CRM05 Reporting Read-Models And Forecast Snapshots`.
- `P38-CRM06 Lead Dedupe Domain Foundation`.
- `P38-DG05 Lead Routing Design`.
- `P38-CRM07 Lead Routing Domain Foundation`.
- `P38-CRM08 Routing Persistence And Cursor Adapter`.
- `P38-CRM09 Routing Admin UX And Rule Management`.

CRM07 does not depend on CRM04 or CRM05. It also does not authorize pipeline persistence, reporting,
tasks, templates, sequences, activity channel specializations, scoring, consent, enrichment, search,
retention, workflow automation, or UI redesign.

## Non-Goals

- No routing schema, SQL adapter, worker, web UI, notification fanout, or lead ownership transfer
  persistence in this design gate.
- No re-route-on-stage-change behavior; CRM07 covers initial routing decisions only.
- No automatic merge, lead cleanup job, account/contact dedupe, deal merge, or pipeline/deal
  persistence.
- No reporting read-models or forecast snapshots.
- No proxy, canonical route, auth, tenancy, Stripe, README, AGENTS, or broad architecture-doc
  changes.

## Promotion Boundary

Merging this design gate authorizes `P38-CRM07 Lead Routing Domain Foundation` only. Routing
persistence, cursor adapters, routing admin UX, web auto-assignment flows, stage-triggered
re-routing, notifications, and dashboard changes require later design gates.

## Promotion / Sign-off

| Slice                                                    | Status   | Authority                    | Notes                                                                      |
| -------------------------------------------------------- | -------- | ---------------------------- | -------------------------------------------------------------------------- |
| `P38-CRM06 Lead Dedupe Domain Foundation`                | complete | PR `#750`                    | Merge commit `c7412618c9f55adf85a75d8f06d7b5de51961254`.                   |
| `P38-CRM04 Pipeline And Deal Persistence`                | reserved | `P38-DG03` follow-up         | Still valid; not consumed by this dedupe-to-routing gate.                  |
| `P38-CRM05 Reporting Read-Models And Forecast Snapshots` | reserved | post-pipeline/reporting gate | Still blocked by persistence; not consumed by this gate.                   |
| `P38-CRM07 Lead Routing Domain Foundation`               | promoted | `P38-DG05`                   | Domain-only routing foundation; persistence and web behavior are deferred. |
| `P38-CRM08 Routing Persistence And Cursor Adapter`       | reserved | post-CRM07 persistence gate  | Future schema, adapters, and compare-and-swap cursor persistence.          |
| `P38-CRM09 Routing Admin UX And Rule Management`         | reserved | post-routing persistence     | Future rule CRUD, branch-scoped admin, and UI workflow slice.              |
