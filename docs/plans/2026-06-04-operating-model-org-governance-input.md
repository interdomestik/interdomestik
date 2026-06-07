---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
related: docs/plans/2026-06-04-sales-network-architecture-input.md
---

# Operating Model — Legal Entity, Departments, Roles & Approvals (Critique & Input)

> Rolled up into the post-M3 program packet: `docs/plans/2026-06-04-ida-operating-model-sales-governance-program.md` (OMG-01/02/07/08).

> Status: **non-authoritative input.** Architecture assessment responding to the "tenant as real legal/operational entity" proposal. Does not modify the canonical plan/tracker, `proxy.ts`, routes, auth, tenancy, or Paddle. Promotion requires the planning-governance flow.

## Verdict

**Agree with the principle. Agree the tenant must be a legal + operational entity, not a technical partition — and the foundation already treats it that way.** But I push back firmly on the _implementation shape_: do **not** build a 13-table ERP org system with ~25 flat roles and a generic approval-workflow engine during Phase C pilot. That is premature and would regress the clean capability-matrix RBAC the repo already has into role sprawl. Model the **capability** (department scope + separation-of-duties + the 2–3 money/legal approvals that matter), not the full org chart, until the org actually has those people.

## Direct answer: does the platform account for this today?

**Partly — the hard part is done; the org/department layer is the gap.**

| Concern                                                                                    | Status in repo today                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant = legal entity (contract/billing/law) vs data-isolation scope                       | **Accounted for.** `legal_tenant_id` vs `access_tenant_id` (four-context model, Rev 3); entity-of-record billing (T-408).                    |
| Capability-based permissions (not "everything is admin")                                   | **Accounted for.** `PERMISSIONS` matrix (`claims.read`, `members.write`, `roles.manage`, `tenants.manage`, …) × `ROLE_PERMISSIONS`.          |
| Role de-collapse (admin ≠ tenant_admin ≠ super_admin) + cross-tenant read role             | **In progress.** T-301 + `global_support`/`auditor`.                                                                                         |
| Super_admin = technical guardian, not business approver; break-glass; separation of duties | **Already added (Rev 6).** T-301b (break-glass audit), T-301c + ADR-09 (SoD). Your proposal re-derives these — good validation, no new work. |
| Cross-tenant only via audited handoff                                                      | **Accounted for.** T-209 + Rev 6 case-scoped grant.                                                                                          |
| Intra-tenant **departments / org units**                                                   | **Missing.** No `org_unit`/`tenant_department`. (A `branch_manager` role + branches exist as a scoping precedent.)                           |
| **Approval workflows** (onboarding, settlement, B2B, court)                                | **Partial.** Recovery activation gates + court invariants exist (T-203/SVC-09); no generic approval engine.                                  |
| Board governance / group-consolidated dashboards                                           | **Missing.**                                                                                                                                 |
| Expanded department role taxonomy                                                          | **Missing (and should stay small — see below).**                                                                                             |

So: _legal-entity + isolation + capability RBAC + SoD/break-glass are in._ _Departments + approvals + management hierarchy + group dashboards are not._ Those are warranted for full operational readiness — but as a capability layer on the existing spine, not a greenfield ERP.

---

## Required modifications (critique)

### 1. Department scope = capability × tenant × `org_unit`, NOT 25 flat roles

The repo already does RBAC as a **permission matrix**. The proposal's ~25-role enum (`TENANT_FINANCE_OFFICER`, `TENANT_CLAIMS_HANDLER`, …) would re-create the "stringly role" sprawl the architecture just moved away from, and make "who can do X" unanswerable again. Use what your own §2 already proposes:

```
authorization = base capability set  ×  access_tenant_id (isolation)  ×  org_unit_id (department scope)  ×  actor_role_on_session
```

- Keep a **small base role set** (extend the existing 7: add `tenant_general_manager`, a `finance` base, a `sales` base, an `auditor` base).
- Express "Finance Officer of MK" as `finance` capabilities **scoped** to `tenant_mk / FINANCE`, not a distinct global role.
- Department membership (`tenant_users.org_unit_id` + `department_role`) is an **authorization scope layered over `access_tenant_id`**, never a second isolation mechanism (RLS still isolates the tenant).

This gives you every role in the proposal as a _derived_ scope, without 25 enum values and an unmaintainable matrix.

### 2. Approvals: gated commands now, generic engine later

A generic `approval_workflows`/`approval_requests` engine is a large build that pilot does not need. The approvals that carry **money or legal risk** — commission settlement above threshold, court escalation, B2B contract activation, partner activation — should be **specific gated commands/state-machines** (the same `canTransition`/recovery-invariant pattern), each emitting a `domain_events` audit event. Defer the generic, configurable workflow engine until there are many workflow types. Build the 3–4 that matter; don't build the framework.

### 3. Separation of duties + break-glass are already covered (Rev 6) — reuse, don't re-add

T-301b (break-glass with mandatory audit event) and T-301c + ADR-09 (super_admin technical-guardian, cannot self-approve payments/fees/terms/contracts) already encode the proposal's hard rules. No new tasks; just ensure the department roles inherit them.

### 4. Group/board dashboards = cross-tenant **read-model**, never relaxed isolation

"Board sees revenue across MK/KS/AL" is a cross-tenant read — permitted only for `super_admin`/`global_business_admin`/`auditor` (the cross-tenant-read role from ADR-09), and served by an **aggregation/read-model projection over `domain_events`**, not by widening RLS or `access_tenant_id`. Tenant-level dashboards stay strictly tenant-scoped.

### 5. Sales/Finance/IT must not read claim/medical/recovery — same invariant as the sales-network doc

This is ADR-05 attribution-vs-access again. Reinforces the existing-`agent`-has-`claims.read` finding (sales-network input §2): the role/scope model must grant claims/document/recovery access **only** to claims/recovery roles with the right scope (+ consent for medical). Finance, Sales, IT, Board, Partners: never.

### 6. AL-under-MK shadow — adopt as-is (consistent across both docs)

```
market_country = AL ; operating_legal_tenant_id = tenant_mk ; future_legal_tenant_id = tenant_al ; tenant_al_status = shadow
```

Matches the four-context model + entity migration (T-506/507). Adopt verbatim.

---

## Minimal data model (if/when promoted) — additive, scoped

```
legal_entities            (formalize tenant↔legal entity; ties to T-504 tenants split)
tenant_departments        (id, tenant_id, department_type, name, manager_user_id, status)
tenant_users              (user_id, tenant_id, org_unit_id, base_role, access_scope, status)
department_assignments    (user_id, org_unit_id, department_role)
approval_requests         (id, tenant_id, request_type, requested_by, approved_by, status, audit_event_id)
board_members             (group-level governance; cross-tenant read only)
```

Reuse: `domain_events` for `org.*`/`approval.*` events (no separate audit table); existing `PERMISSIONS` matrix; `access_tenant_id` for isolation; `branch_manager`/branches as the scoping precedent.

---

## Sequencing (Phase C discipline)

This is a **separate "Operating Model & Governance" program**, gated on the finalization spine — not an M0–M5 item:

- **In current scope already:** role de-collapse (T-301), `global_support`/`auditor`, break-glass (T-301b), SoD (T-301c), no-raw-role-arrays lint (T-006b). Finish these in M3; they are the foundation the org layer sits on.
- **New program (post-M3), depends on:** `access_tenant_id` isolation (M3), event outbox (M1), entity-of-record billing (M5). Build department scope → gated approvals → group read-model dashboards, in that order.
- Do **not** inject departments/approvals/board into the M0–M5 tracker, and do not implement the full 25-role taxonomy or a generic workflow engine in pilot.

## What NOT to do now

- No 25-role flat enum (use base roles × scopes).
- No generic approval-workflow engine (gated commands for the 3–4 risk approvals).
- No department layer before `access_tenant_id` isolation lands (M3).
- No board dashboard that reads across tenants by relaxing RLS.
- No business-approval power for `super_admin`/IT (already enforced by Rev 6 SoD).

## Open decisions

1. Base-role set: how few can express the full taxonomy via scopes (recommend ≤ ~10 base roles + department scope).
2. Which approvals are pilot-critical enough to build now (recommend: commission settlement-above-threshold, court escalation, partner/B2B activation).
3. Group-consolidated reporting: live read-model vs periodic batch.
4. Promotion timing relative to M3 completion and the sales-network program.
5. Legal: board/governance data-access boundaries per entity (counsel).
