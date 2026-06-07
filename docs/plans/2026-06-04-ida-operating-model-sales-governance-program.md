---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
program_id: OMG
rolls_up:
  - docs/plans/2026-06-04-sales-network-architecture-input.md
  - docs/plans/2026-06-04-operating-model-org-governance-input.md
depends_on:
  - M3 tenant isolation + role de-collapse (T-301, T-302/302b/c/d, T-306)
  - M1 domain_events / audit outbox (T-104/104b)
  - M5 entity-of-record billing ledger (T-408, T-204)
---

# Program Promotion Packet — IDA Operating Model & Sales Governance (`OMG`)

> Status: **non-authoritative draft input.** Not active work and not source-of-truth. This packet unifies the sales-network and org/governance inputs into one **post-M3 program** for later promotion via the planning-governance flow (`current-program.md` / `current-tracker.md`). It does **not** modify the canonical plan/tracker, the M0–M5 finalization tracker, `apps/web/src/proxy.ts`, canonical routes, auth, tenancy, or the billing provider (Paddle). No runtime code is implied by this document.

## 1. Decision

**Agreed and scoped.** The corporate operating structure (legal entities, departments, management hierarchy, approvals, board governance, sales network) **must** be reflected in the platform — but **not** during Phase C / M0–M5, and **not** as a 25-role flat enum + generic workflow engine. It is promoted here as a **single post-M3 program** that _consumes_ the finalization spine and is built as **base roles × scopes + a handful of gated commands**, not an ERP build-out.

This packet supersedes nothing; it rolls up the two reviewed inputs and gives them one sequenced home.

## 2. Goal / Non-goals

**Goal:** an operating-model layer that lets **Interdomestik DOOEL Shkup (`tenant_mk`)**, **SHPK Prishtinë (`tenant_ks`)**, and **SHPK Tiranë (`tenant_al`)** operate as separate legal/financial/operational entities inside one IDA platform — with departments, scoped roles, the money/legal approvals that carry risk, a sales/partner network, B2B/fleet, and group read-only governance dashboards.

**Non-goals (hard):**

- No generic configurable workflow engine in the first phase (gated commands only).
- No 25+ flat role enum (base roles × `access_tenant_id` × `org_unit_id` × capabilities).
- No relaxing tenant isolation for board dashboards (aggregated read-model only).
- No sales/partner/finance/IT/board access to claims / documents / recovery / medical.
- No expansion of Phase-C / M0–M5 scope; nothing here enters the finalization tracker.
- No `super_admin` business-approval power (it is a technical guardian; Rev 6 SoD + break-glass already enforce this).

## 3. Dependencies (why post-M3)

| Prerequisite                                                      | Provides                                                         | Tracker                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| Four-context resolver + `access_tenant_id` isolation/RLS          | the scope the org/department layer sits on                       | M3 (T-302/302b/c/d)          |
| Role de-collapse + `global_support`/`auditor` + SoD + break-glass | the base-role/SoD foundation OMG-02 extends                      | M3 (T-301/301b/301c, T-006b) |
| `domain_events` transactional outbox                              | audit events for every approval + the board read-model source    | M1 (T-104/104b)              |
| Entity-of-record billing + event-bridged settlement               | commission settlement + B2B invoicing bound to `legal_tenant_id` | M5 (T-408, T-204)            |
| Attribution-read-only                                             | partners attribute sales without gaining access                  | M3 (T-306, ADR-05)           |
| Entity migration (active-case guard)                              | AL-under-MK → AL migration                                       | M5 (T-506/507)               |

**OMG cannot start until M3 exit criteria are green.** Only OMG-00 (spec, no runtime) may be drafted earlier.

## 4. Architecture principles (binding for the program)

1. **Base roles × scopes, never role explosion.** `authorization = base_role × access_tenant_id × org_unit_id × capabilities`. "Finance Officer of MK" = `finance` capabilities scoped to `tenant_mk / FINANCE`, not a distinct global role. Extends the existing `PERMISSIONS` matrix + `branch_manager` scoping precedent.
2. **Departments layer over isolation, not beside it.** `org_unit_id` is a within-tenant authorization scope; `access_tenant_id` + RLS still isolates the tenant. Department is never a second isolation mechanism.
3. **Approvals are explicit gated commands** (the `canTransition`/recovery-invariant pattern), each emitting a `domain_events` audit event. No generic engine in phase one.
4. **Board dashboards are aggregated read-models over `domain_events`**, served only to cross-tenant-read roles (`super_admin`/`global_business_admin`/`auditor`). Never direct unrestricted tenant-table queries; never sensitive documents.
5. **Money movement stays in `domain-billing`.** Sales-network computes commission entries; billing settles/invoices/pays on `sales.commission_earned`, bound to `legal_tenant_id`. Reuse existing `commission_status`/`commission_type` enums.
6. **B2B entitlement → subscription.** Activation produces a `subscription` (entity-of-record = `legal_tenant_id`, payer = `corporate_account`); no parallel membership object.
7. **Sales role ≠ claims access** (ADR-05). Includes fixing the pre-existing `agent.claims.read` (see risk R6).
8. **AL operates under MK during the shadow period:** `market_country=AL`, `legal_tenant_id=tenant_mk`, `tenant_al_shadow` reserved, migrate via T-506/507.

## 5. Milestones

| ID         | Milestone                                | Acceptance criteria                                                                                                                                                                                                                                | Depends on                |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **OMG-00** | Program spec (no runtime)                | Scope, `org_unit` model, scoped-permission model, approval-command list, sales/governance dependency map; entity + permission models documented; explicit non-goals. No code.                                                                      | M3 spec readiness         |
| **OMG-01** | Org-unit model                           | Additive `org_units`/`tenant_departments`/`tenant_management_assignments`; department types (SALES/FINANCE/CLAIMS/RECOVERY/LEGAL/IT/SUPPORT/BOARD); scoped **under** `access_tenant_id` (RLS unchanged); test: MK department rows invisible to KS. | OMG-00, M3 isolation      |
| **OMG-02** | Scoped permissions                       | `base_role × tenant_scope × org_unit_scope × capabilities`; ≤ ~10 base roles express the full taxonomy; test: "who can do X" resolvable; no flat per-country roles; reuses `PERMISSIONS` matrix.                                                   | OMG-01, T-301             |
| **OMG-03** | Sales network core                       | `sales_partners`, `partner_users`, `sales_codes` (TENANT-CHANNEL-PARTNER-LOCATION-USER), `commission_rules`, `membership_orders`; attribution reuses `ownership-attribution`; **no claims/document access** for any sales role (test).             | OMG-02, T-306, T-408      |
| **OMG-04** | Partner / B2B activation (gated command) | sales creates → legal approves contract → finance approves commission/tax → tenant GM activates → audit event; each step a gated transition with `domain_events` proof.                                                                            | OMG-03                    |
| **OMG-05** | Commission settlement (gated command)    | system computes → finance reviews → tenant GM approves above threshold → payout via `domain-billing` on `sales.commission_earned` → audit event; refund/chargeback reverses idempotently (reuse `commercial_action_idempotency`).                  | OMG-03, T-408/T-204       |
| **OMG-06** | Corporate fleet / bulk purchase          | offer → finance price approval → legal contract → invoice (`legal_tenant_id`) → `membership_entitlements` → activation produces `subscription` per driver/vehicle; fleet admin sees activation only, never claims/docs (test).                     | OMG-03, membership system |
| **OMG-07** | Court escalation approval                | recovery proposes → legal review → member consent → cost approval → tenant GM approval if threshold → lawyer assigned; reuses recovery invariants (M2) + audit.                                                                                    | M2 recovery, OMG-02       |
| **OMG-08** | Board cross-tenant read model            | aggregated read-model over `domain_events` (revenue/memberships/claims/commissions/risk per tenant); served only to cross-tenant-read roles; test: board cannot reach individual sensitive docs or relax RLS.                                      | M1 outbox, T-301 roles    |
| **OMG-09** | AL-under-MK shadow migration readiness   | `market_country=AL` + `legal_tenant_id=tenant_mk` + `tenant_al_shadow` markers on sales/partners/orders; AL reporting separable; migration dry-run to `tenant_al` with active-case guard.                                                          | T-506/507                 |

## 6. Dependency graph

```
[M3 isolation/roles] [M1 outbox] [M5 billing] [M2 recovery]   (finalization prerequisites)
        └──────────────┬───────────────┬───────────┘
                     OMG-00
                       │
                     OMG-01 ── OMG-02 ─┬─ OMG-03 ─┬─ OMG-04
                                       │          ├─ OMG-05
                                       │          └─ OMG-06
                                       ├─ OMG-07
                                       ├─ OMG-08
                                       └─ OMG-09
```

Critical path: `OMG-00 → OMG-01 → OMG-02 → OMG-03 → {OMG-05/OMG-06}`. OMG-07/08/09 parallelize off OMG-02.

## 7. Risk register

| #   | Risk                                                               | Mitigation                                                                    |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| R1  | Role sprawl (25 flat roles) re-creates "who can do X?" ambiguity   | OMG-02 base-roles × scopes; reuse `PERMISSIONS` matrix; cap ≤ ~10 base roles  |
| R2  | Board dashboards bypass tenant isolation                           | OMG-08 read-model over events only; no direct cross-tenant table access       |
| R3  | Second commission ledger / attribution path forks from existing    | Reuse `ownership-attribution` + `commission_*` enums; billing owns settlement |
| R4  | `membership_entitlements` drifts into a parallel membership object | ADR-17: entitlement activation must mint a `subscription`                     |
| R5  | Premature generic workflow engine slows pilot                      | Gated commands for the 4 risk approvals only; engine deferred                 |
| R6  | Sales/partner can read claims (pre-existing `agent.claims.read`)   | Fix in M3 role work; sales roles get zero claims/doc/recovery capabilities    |
| R7  | AL sales/commissions become indistinguishable inside MK            | Shadow markers (OMG-09) from day one; AL-under-MK reporting                   |
| R8  | Department becomes a second isolation mechanism competing with RLS | OMG-01: org_unit is a scope _within_ `access_tenant_id`, RLS unchanged        |
| R9  | Scope creep pulls OMG into Phase C                                 | This packet stays input until promoted; nothing enters M0–M5 tracker          |

## 8. Test plan (program-level acceptance)

- `tenant_mk` manager / finance / sales cannot see `tenant_ks`/`tenant_al` data (isolation).
- Finance cannot access medical/claim documents; Sales cannot access recovery documents; IT cannot approve commission/finance/legal; Board sees aggregates only.
- No sales/partner/fleet role can reach claims/documents/recovery/medical (ADR-05).
- Recovery cannot start without POA/agreement/assignment; court escalation requires legal + member consent + cost approval.
- Partner onboarding requires legal + finance + GM approval; commission settlement writes an audit event; refund reverses commission idempotently.
- B2B activation mints subscriptions bound to `legal_tenant_id`; fleet admin sees activation only.
- AL market sale during shadow period uses `legal_tenant_id=tenant_mk`, `market_country=AL`.
- Board read-model derives from `domain_events`, not direct tenant-table queries; cannot relax RLS.
- "Who can do X" is answerable from base_role × scope (no flat-role sprawl).

## 9. Explicitly NOT in current pilot scope

This program is **post-M3**. During Phase C / M0–M5: do not add org/department/approval/board tables, do not implement the role taxonomy beyond the existing M3 role de-collapse, do not build a workflow engine, do not start the sales-network runtime. The only items in current scope are the M3 foundations these depend on (role de-collapse, SoD, break-glass, access-tenant isolation), which are already tracked.

## 10. Promotion checklist (governance)

To become active, this packet must: (a) confirm M3/M1/M5 exit criteria are green; (b) be promoted via `current-program.md` + a `current-tracker.md` queue entry (one-active-plan rule); (c) get a per-milestone promotion doc for OMG-00 first (spec only); (d) carry counsel sign-off for the legal-entity, partner-contract, fleet-DPA, and court-escalation items. Until then it stays `status: draft` input.

## 11. Open decisions

1. Final base-role set (target ≤ ~10) and the capability list per department.
2. Which of OMG-04/05/06/07 is the first gated command to build (recommend OMG-05 commission settlement — highest money risk).
3. Board read-model: live projection vs periodic batch.
4. Fleet-driver DPA + medical/sensitive consent model (counsel).
5. Promotion timing relative to M3/M5 completion and the VONESA (WS-F) program.
