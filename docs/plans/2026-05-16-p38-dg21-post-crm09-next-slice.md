# P38-DG21 Post-CRM09 Next Slice Selection

Status: complete
Slice: `P38-DG21`
Owner: platform + product + qa
Phase: Phase C
Date: 2026-05-16
Authority: completed design gate. This document promotes exactly one implementation slice.
Recommended implementation slice: `P38-CRM23 Controlled Routing Application Service`
Promoted implementation slice: `P38-CRM23 Controlled Routing Application Service`

Status vocabulary: `complete` records an approved design gate that may promote exactly one
implementation slice. Tracker queue statuses remain the repo-audited values `completed`,
`in_progress`, `pending`, and `blocked`.

## Status / Predecessor Closeout

`P38-CRM09 Routing Admin UX And Rule Management` is complete through PR `#791`, merge commit
`a59397cd9305fdc5b1419f08f1fc2a1ae56bf039`. CRM09 shipped the DG20-promoted admin-only routing-rule
panel as `apps/web/src/app/[locale]/admin/crm/_routing-core.ts` (`getAdminCrmRoutingRulesCore`),
`_routing-action.ts`, `_routing-types.ts` (the `ADMIN_CRM_ROUTING_*` marker constants),
`_routing-rules-panel.tsx`, and app-side write-path helpers layered on
`apps/web/src/lib/domain-crm/routing-repository.ts`. Branch-manager exclusion, localized
`admin-crm.routing.*` copy across `sq`/`en`/`sr`/`mk`, focused route-core/action/repository/page/PII
proof, and the `@admin-crm-routing-rules` E2E all landed. Local proof covered `pnpm check:db-access`,
i18n completeness/purity, plan/tracker/docs audits, `interdomestik_qa.scope_audit`, and
`security:guard`; remote proof passed SonarCloud (0 new issues), audit/unit/static, PR E2E,
e2e-gate, pilot-gate, commitlint, gitleaks, pnpm-audit, and validation-surface.

CRM09 proved that operators can inspect and maintain durable routing rules but intentionally did
not apply those rules to leads. The remaining routing credibility gap is a controlled service
boundary that composes CRM07 selection with CRM08 persistence and existing lead ownership
discipline without turning on automatic routing.

## Decision

Promote exactly one bounded implementation candidate:

`P38-CRM23 Controlled Routing Application Service`

CRM23 adds the smallest explicit routing-application service that executes a routing decision for a
single tenant-scoped lead under deterministic authorization, atomicity, and idempotency. It must
not wire the service into lead creation, cron, campaign automation, public routes, or UI controls
in the first slice. The only caller in the first slice is the test suite.

## P38 Foundation Completion Bar

DG21 also sets the cutoff for the current P38 CRM Foundation tranche. P38 is complete after CRM23
lands and a final closeout records that:

- Lead, account, contact, and deal domain foundations exist.
- Pipeline, reporting, and forecasting surfaces are usable on the existing canonical CRM surfaces.
- Routing rules can be managed and applied through a controlled service.
- Legacy deal cleanup and nullability risks are either closed or explicitly deferred with rationale.
- Remaining roadmap items such as tasks, templates, sequences, scoring, and consent are moved to a
  later program unless they become required for pilot operation.

That closeout must not promote another broad "post-CRM" foundation slice by default. Any later CRM
work must start from a new repo-canonical program or a narrowly justified pilot blocker.

## Candidate Ranking

| Rank | Candidate                                          | Decision                                                                                 |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `P38-CRM23 Controlled Routing Application Service` | Promote. CRM09 proved rule management; the next gap is controlled, testable application. |
| 2    | `P38-CRM25 Routing Audit Retention`                | Defer. Retention policy matters after routing decisions are actually applied.            |
| 3    | `P38-CRM10 Legacy Deal Column Retirement`          | Defer. Independent deal cleanup; keep behind explicit parity/deprecation proof.          |
| 4    | `P38-CRM11 Deal Nullability Tightening`            | Defer. Requires production zero-null proof and quarantine/backfill discipline.           |
| 5    | Tasks/templates/sequences foundation               | Defer. Next roadmap block, but routing remains unfinished after CRM08/CRM09.             |

## Source Inputs

- `docs/plans/2026-05-14-p38-dg05-lead-routing-design.md` for the CRM07 routing contract.
- `docs/plans/2026-05-16-p38-dg19-post-crm21-next-slice.md` for CRM08 persistence, cursor, audit,
  and the retry-budget / outbox-boundary discipline this gate inherits.
- `docs/plans/2026-05-16-p38-dg20-routing-admin-ux-design.md` for CRM09 rule-management scope and
  the deferred routing-application candidate this gate now promotes.
- `packages/domain-crm/src/routing/mutations.ts` (`selectCrmLeadAssignee`), `routing/types.ts`
  (rejection/manual-review reasons, `crm.lead.routed` event data), and `routing/repository.ts`
  (`CrmRoutingRepository.listRoutingRules` / `advanceRoutingCursor` /
  `appendRoutingAssignmentAudit`).
- `packages/domain-crm/src/leads/mutations.ts` (`transferCrmLeadOwnership`) and
  `apps/web/src/lib/domain-crm/lead-mutation-repository.ts` (`transferOwnership`, which already
  runs a `db.transaction` that updates `crm_leads`, closes the open `crm_lead_ownership_history`
  row, and inserts a new open row).
- `packages/domain-crm/src/outbox/repository.ts` (`CrmOutboxPort.appendEvent` /
  `appendEvents`).
- `apps/web/src/lib/domain-crm/routing-repository.ts` for the CRM08/CRM09 SQL adapter boundary the
  new service composes against.
- `docs/plans/current-program.md` and `docs/plans/current-tracker.md`.

## Implementation Scope For P38-CRM23

Allowed:

- Add a pure domain entry point `applyCrmLeadRoutingDecision` under
  `packages/domain-crm/src/routing/` that composes `selectCrmLeadAssignee` with repository ports
  for routing persistence, lead ownership transfer, and outbox append. The pure entry point must
  remain SQL-free; no `drizzle-orm` import may appear under `packages/domain-crm/src`.
- Add a thin app-side coordinator under `apps/web/src/lib/domain-crm/` that wires the pure entry
  point into a single `db.transaction` covering the four writes listed under Transaction Contract.
- Compose existing CRM07 routing selection with CRM08 rule, cursor, and audit persistence; reuse
  `apps/web/src/lib/domain-crm/routing-repository.ts` and the existing
  `lead-mutation-repository.ts` `transferOwnership` discipline.
- Enqueue the typed `crm.lead.routed` event through `CrmOutboxPort.appendEvent` inside the same
  transaction when routing succeeds. Do not invent a new outbox table, worker, scheduler, or
  external notification path.
- Update DB-access baseline only for the new service queries, with comments that keep the adapter
  boundary explicit.
- Add focused domain/app tests for tenant isolation, branch isolation, dedupe-state eligibility,
  terminal-lifecycle ineligibility, manual-only behavior, cursor compare-and-swap retry,
  idempotent replay, audit append, ownership-history append, outbox append, and every no-write
  failure path.

Must not touch:

- `apps/web/src/proxy.ts`.
- Canonical routes, route authority, auth/session layering, or tenant isolation architecture.
- New UI, sidebar IA, public/member/agent/staff/admin route wiring, cron jobs, scheduled jobs,
  campaign automation, webhooks, or automatic routing on lead creation. CRM23 must not become the
  manual-override pathway either; manual override remains a CRM07 manual-review posture and is
  not promoted to an assignment or ownership-transfer pathway here.
- CRM09 routing-rule UI behavior except for shared helper reuse that is strictly necessary for
  service validation.
- New schema/RLS migrations unless a narrow index is required and justified in the implementation
  PR. Any added index must follow the existing CRM08 `(tenant_id, …)` style.
- Stripe, README, AGENTS.md, or broad architecture docs.

## Service Surface

CRM23 ships one typed entry point. Pure shape lives in the domain; the app-side coordinator owns
the transaction.

```ts
export interface ApplyCrmLeadRoutingDecisionInput {
  actor: CrmActorContext;
  leadId: string;
  idempotencyKey: string;
  now: string;
  override?: CrmRoutingManualOverride;
}

export type ApplyCrmLeadRoutingDecisionResult =
  | {
      outcome: 'routed';
      agentId: string;
      ruleId: string;
      strategy: CrmRoutingStrategy;
      event: CrmLeadRoutedEventData;
      ownershipChanged: boolean;
    }
  | { outcome: 'idempotent_replay'; agentId: string; ruleId: string; strategy: CrmRoutingStrategy }
  | { outcome: 'manual_review'; reason: CrmRoutingManualReviewReason; ruleId?: string }
  | { outcome: 'no_rule' }
  | { outcome: 'rejected'; reason: CrmRoutingRejectionReason }
  | { outcome: 'cursor_conflict_exhausted' }
  | {
      outcome: 'stale_lead';
      reason: 'lifecycle_terminal' | 'dedupe_state' | 'concurrent_owner_change';
    }
  | { outcome: 'repository_failure' };
```

The pure entry point throws only for unexpected programmer errors; every expected outcome is a
typed variant. The app-side coordinator wraps the pure call in a single transaction, maps adapter
exceptions to `repository_failure`, and returns the same union.

## Authorization, Idempotency, And Transaction Contract

Authorization. CRM23 is a service-boundary slice, not an operator UI slice. The caller must pass a
trusted `CrmActorContext` re-derived at the server boundary before any repository work. Admin
actors may route tenant-wide leads. Branch-manager actors may route only when the actor has a
non-null branch scope and the target lead and the candidate-rule branch scope both match that
branch. Staff, agent, member, unauthenticated, tenantless, and roleless callers fail closed with
`rejected: role_scope` (or `tenant_scope` / `branch_scope` per CRM07's `authorizeRouting`) before
any read of the lead or rules.

Idempotency. Every request must carry a non-empty `idempotencyKey`. That key is the same key
written to `crm_routing_assignments_audit.idempotency_key`, which DG19's partial unique index
already enforces. On replay, the coordinator first reads any existing audit row for
`(tenantId, idempotencyKey)`; if present and consistent with the request, it returns
`idempotent_replay` without re-selecting, re-advancing the cursor, re-appending the audit, or
re-emitting the outbox event. An audit row whose `(leadId, actorId)` does not match the replayed
request is treated as `rejected: invalid_override`.

Transaction boundary. When routing succeeds, the app-side coordinator must execute all four writes
in a single `db.transaction`:

1. `lead-mutation-repository.transferOwnership` updates `crm_leads`, closes the open
   `crm_lead_ownership_history` row, and inserts the new open row (existing discipline; do not
   bypass).
2. `routing-repository.advanceRoutingCursor` runs the compare-and-swap on
   `(tenant_id, rule_id, cursor_value)`.
3. `routing-repository.appendRoutingAssignmentAudit` writes the audit row keyed by
   `(tenant_id, idempotency_key)`.
4. `CrmOutboxPort.appendEvent` enqueues the typed `crm.lead.routed` event.

If any step fails the entire transaction rolls back and the coordinator returns the appropriate
typed outcome. When the selected agent equals the lead's current owner, the coordinator must
short-circuit step 1 (`ownershipChanged: false`) but must still advance the cursor, append the
audit, and emit the event.

Cursor retries. Cursor conflicts retry at most three times in a single request, matching the DG19
budget. The coordinator re-reads the current cursor and re-runs `selectCrmLeadAssignee` between
retries. Exhausted retries return `cursor_conflict_exhausted` with no partial writes.

Stale-lead definition. Before applying a decision the coordinator re-reads the target lead inside
the transaction and rejects with `stale_lead` when (a) the lead's lifecycle state is `won`,
`lost`, `closed`, `converted`, or `archived`, or (b) the lead's dedupe state is `merge_pending`
or `merged_loser`, or (c) the lead's `(agentId, branchId)` differs from the snapshot the selector
ran against (concurrent owner change).

## Data And Privacy Contract

The service may read only the lead fields needed for routing eligibility, branch scope, dedupe
state, current owner, and existing ownership-history append. Rule matching may use CRM09-supported
filters. No response may include lead/contact/member names, email, phone, notes, descriptions,
activity text, claim text, deal names, or other free-text PII. Logs and audit metadata must stay
aggregate or opaque: tenant ID, lead ID, rule ID, selected agent ID, branch ID, strategy, reason
code, idempotency key, and timestamps are sufficient. The `idempotencyKey` is persisted as-is in
`crm_routing_assignments_audit.idempotency_key` (CRM08 column) and must not be derived from PII;
callers must supply opaque keys.

## Risks

- **Atomicity drift.** Splitting the four writes across two transactions would let ownership move
  without an audit row or without cursor advance. Mitigate by requiring a single
  `db.transaction` in the coordinator and asserting the boundary in an adapter test.
- **Replay divergence.** A second caller replaying the same key with a different lead or actor
  must not be silently re-attributed to the prior assignment. Mitigate with the `(leadId, actorId)`
  consistency check on replay.
- **Cursor starvation.** High lead-creation volume could exhaust the three-retry budget. Mitigate
  by returning the typed `cursor_conflict_exhausted` outcome so callers can decide to retry on
  their own cadence; do not silently re-loop.
- **Scope creep into auto-apply.** Any PR that wires CRM23 into a lead-creation handler, cron, or
  webhook in the first slice must be rejected at review.
- **Outbox coupling.** Enqueueing inside the transaction couples routing latency to outbox write
  latency, but it is the only way to avoid a routed-without-event window. Mitigate by keeping the
  outbox call to one row and never blocking on external delivery in the request path.

## Resolved Review Questions

- Service entry point is named `applyCrmLeadRoutingDecision`; pure shape lives in
  `packages/domain-crm/src/routing/`, coordinator lives in `apps/web/src/lib/domain-crm/`.
- Cursor retry budget is fixed at three, matching DG19.
- The request `idempotencyKey` is the same value persisted in
  `crm_routing_assignments_audit.idempotency_key`; replay reads that row.
- The typed `crm.lead.routed` event is enqueued through `CrmOutboxPort.appendEvent` inside the
  transaction; no new outbox table is added.
- Manual override remains a CRM07 manual-review posture; CRM23 does not become a manual-override
  application pathway.
- The first slice has no UI, no cron, no public/agent/staff/admin route caller; tests are the only
  caller until a later gate promotes a controlled trigger.

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

Implementation PR proof after CRM23 starts must include focused
`packages/domain-crm/src/routing/` and `apps/web/src/lib/domain-crm/` service tests (covering
every variant of `ApplyCrmLeadRoutingDecisionResult` plus the transaction-rollback path),
web type-check and lint if app code is touched, `pnpm check:db-access`,
`pnpm db:migrations:check-journal` if any additive index lands, `pnpm db:rls:test:required`,
static slice verification, diff-scoped security review, `pnpm ci:local:pr`, `pnpm pr:verify`,
`pnpm security:guard`, and `pnpm e2e:gate`. `pnpm ci:local:full` is required if the implementation
adds schema/RLS, changes gate coverage, or touches routing/auth/tenancy-adjacent verification
surfaces. Browser validation is not required and is not authorized in this slice; CRM23 has no
user-facing behavior.
