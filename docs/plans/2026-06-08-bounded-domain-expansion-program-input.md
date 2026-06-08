---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-06-08
program_id: DOM
rolls_up:
  - docs/plans/2026-06-04-ida-operating-model-sales-governance-program.md
  - docs/plans/2026-05-14-p38-dg07-reporting-forecast-design.md
depends_on:
  - M1 domain_events / audit outbox (T-104/104b) — shipped
  - M3 four-context isolation + role de-collapse (T-301, T-302/302b/c/d, T-306)
  - M5 entity-of-record billing ledger (T-408, T-204, T-111/T-112 foundation)
---

# Program Promotion Packet — Bounded Domain Expansion (`DOM`)

> Status: **non-authoritative draft input.** Not active work and not source-of-truth. This packet registers five bounded domains — `domain-reporting`, `domain-sales`, `domain-finance`, `domain-partners`, `domain-billing` (simplified) — as a gated milestone program. It is the **bounded-context / package-decomposition view** of work already owned by `ARCH-M5`, the `OMG` program, and the `P38` reporting line; it introduces **no new execution authority**. It does **not** modify `current-program.md`/`current-tracker.md` beyond its registration entries, the M0–M5 finalization tracker, `apps/web/src/proxy.ts`, canonical routes, auth, tenancy, or the billing provider (Paddle). No runtime code is implied.

## 1. Decision

**Agreed and scoped.** The five domains are promoted here as a **single gated program** that _packages_ and _decouples_ capabilities that already have a registered home, rather than as five independent greenfield builds. Execution still flows through `ARCH` (spine) and `OMG` (operating model); `DOM` is the bounded-context contract that says _which package owns what_ and _how RLS and money movement stay single-sourced_. It enters the active queue only after `ARCH M1→M5` exit criteria are green and it is promoted via the planning-governance flow.

## 2. Goal / Non-goals

**Goal:** five clean bounded contexts that improve modularity, keep tenant RLS intact, and decouple sales / finance / partner / reporting / billing workflows from the claims-and-recovery core.

**Non-goals (hard):**

- No new isolation mechanism: `org_unit_id` is an in-tenant scope; `access_tenant_id` + RLS stay the only isolation.
- No second commission ledger and no parallel billing engine — money movement stays in `domain-billing`.
- No Stripe; Paddle remains the sole provider.
- No sales/partner/finance/reporting access to claims/documents/recovery/medical (ADR-05).
- No `apps/web/src/proxy.ts`, canonical-route, or auth-layer changes.
- No entry into Phase C / M0–M5 scope; nothing here joins the finalization tracker until promoted.
- No big-bang rename of `domain-membership-billing` (facade + Boy-Scout only).

## 3. Dependencies (why gated)

| Prerequisite                                   | Provides                                                         | Tracker                                   |
| ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `domain_events` transactional outbox           | event source for reporting read-models + settlement/audit events | M1 (T-104/104b) — shipped                 |
| Four-context resolver + `access_tenant_id` RLS | the scope sales/finance/reporting tables sit on                  | M3 (T-302/302b/c/d)                       |
| Role de-collapse + SoD + break-glass           | base-role foundation; fixes `agent.claims.read` over-grant       | M3 (T-301/301b/c, T-006b)                 |
| Entity-of-record billing                       | `legal_tenant_id`-bound settlement/invoicing                     | M5 (T-408, T-204; foundation T-111/T-112) |
| Attribution read-only                          | partners attribute sales without gaining access                  | M3 (T-306, ADR-05)                        |

**`DOM` cannot start until M3 exit criteria are green** (except `DOM-00`, spec only, and the `DOM-05` facade skeleton which only re-exports existing `domain-membership-billing`).

## 4. Architecture principles (binding)

1. `access_tenant_id` + RLS remain the only isolation; `org_unit_id` is an in-tenant scope.
2. **Money movement stays in `domain-billing`** — `sales` computes entries, `finance` approves, `billing` settles, all bound to `legal_tenant_id`.
3. Read-models (`reporting`, board) derive from `domain_events`, never cross-tenant table joins; they cannot relax RLS.
4. Sales/partner/finance/reporting roles get **zero** claims/recovery/medical/document capabilities (ADR-05).
5. Entitlement activation mints a `subscription` (entity-of-record `legal_tenant_id`); no parallel membership object (ADR-17).
6. Cross-domain communication is via published package APIs (`src/index.ts`), never cross-schema DB joins.
7. Every file ≤ 150 lines; new extracted cores use `*.core.ts`.

## 5. Milestones

| ID         | Milestone                                            | Boundary decision                                                 | Maps to                            | Acceptance criteria                                                                                                                                                                                                                                                                                                       | Depends on             |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **DOM-00** | Program spec / bounded-context contract (no runtime) | —                                                                 | OMG-00, P38                        | Package boundaries, owned-table list, public-API surface per domain, RLS test matrix, money-movement single-source rule, non-goals. No code.                                                                                                                                                                              | M3 spec readiness      |
| **DOM-01** | `domain-reporting`                                   | **Compose** (read-only projections; owns no authoritative tables) | OMG-08, P38                        | Read-model package consuming `domain_events` + `domain-analytics` (v3) + `domain-crm/reporting`; per-tenant reads scoped by `access_tenant_id`; cross-tenant aggregates only for cross-tenant-read roles and only from events; test: board cannot reach sensitive docs or relax RLS.                                      | M1 outbox, M3 roles    |
| **DOM-02** | `domain-sales`                                       | **Greenfield data + compose attribution**                         | OMG-03                             | `sales_partners`/`partner_users`/`sales_codes`/`commission_rules`/`membership_orders`, all `access_tenant_id`-leading + `org_unit` scoped; reuses `ownership-attribution`; AL-under-MK shadow markers; test: no sales role can read claims/docs/recovery (ADR-05).                                                        | M3, DOM-05, OMG-02     |
| **DOM-03** | `domain-finance`                                     | **Compose** (gated commands over billing; no 2nd ledger)          | OMG-05, PC03                       | Commission review → GM threshold approval → payout via `domain-billing`; reuses `commissions/*` + `commission_status/type` enums + `commercial_action_idempotency`; each approval emits a `domain_events` audit event; refund reverses idempotently; finance cannot access medical/claim docs.                            | M5, DOM-05, OMG-03     |
| **DOM-04** | `domain-partners`                                    | **Greenfield + compose** (activation mints subscription)          | OMG-04, OMG-06                     | Partner/B2B/fleet contracts + `membership_entitlements`; gated chain sales→legal→finance→GM→audit; activation mints a `subscription` bound to `legal_tenant_id` (ADR-17); fleet/partner admin sees activation only — never claims/docs (test).                                                                            | DOM-02, DOM-03, DOM-05 |
| **DOM-05** | `domain-billing` (simplified)                        | **Compose / facade** (single money-movement boundary)             | ARCH-M5, domain-membership-billing | Slim public surface (charge/settle/subscribe/refund + entity-of-record) implemented as a facade over `domain-membership-billing` + Paddle; settlement bound to `legal_tenant_id` with `governing_law_snapshot`/`terms_version_accepted`; no Stripe; no parallel engine; consolidation deferred to a later promoted slice. | M1, M5                 |

## 6. Dependency graph

```
[M1 outbox ✓] [M3 isolation/roles] [M5 entity-of-record billing]
        └────────────┬───────────────────────┬───────────────┘
                  DOM-00
                    │
        ┌───────────┼───────────────┐
   DOM-05 billing  DOM-01 reporting │
        │           │               │
        └─────┬──────┘              │
          DOM-02 sales ── DOM-03 finance ── DOM-04 partners
```

Critical path: `DOM-00 → DOM-05 + DOM-01 → DOM-02 → DOM-03 → DOM-04`.

## 7. Risk register

| #   | Risk                                                | Mitigation                                                                           |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| R1  | `DOM` becomes a competing plan vs `OMG`/`ARCH`      | `DOM` is the packaging view bound to OMG/ARCH/P38; one active plan/tracker preserved |
| R2  | `domain-finance` forks a second commission ledger   | Gated commands only; ledger stays in `domain-billing`                                |
| R3  | `domain-billing` forks Paddle / reintroduces Stripe | Facade over `domain-membership-billing` + Paddle; Stripe banned                      |
| R4  | Reporting/board bypasses RLS                        | Read-model over `domain_events`; no cross-tenant table reads                         |
| R5  | New roles inherit claims access                     | ADR-05 zero-claims; fix `agent.claims.read` in M3                                    |
| R6  | Big-bang membership-billing rename                  | Facade + Boy-Scout decomposition; later promoted consolidation slice                 |
| R7  | Scope creep into Phase C                            | Stays draft input + gated until M1→M5 green and promoted                             |

## 8. Promotion checklist (governance)

To become active, this packet must: (a) confirm `ARCH M1→M5` exit criteria are green; (b) be promoted via `current-program.md` + a `current-tracker.md` queue entry (one-active-plan rule); (c) carry a per-milestone promotion doc starting with `DOM-00` (spec only); (d) carry counsel sign-off for the legal-entity, partner-contract, and fleet-DPA items in `DOM-02/03/04`. Until then it stays `status: draft` input.

## 9. Explicitly NOT in current pilot scope

This program is gated behind `ARCH M1→M5`. During Phase C: do not create sales/partner/finance tables, do not build the reporting read-models, do not change billing runtime beyond the facade skeleton, and do not start any `DOM` runtime. The only items in current scope are the M1/M3/M5 foundations these depend on, which are already tracked.
