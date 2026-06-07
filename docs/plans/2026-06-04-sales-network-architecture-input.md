---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-06-04
supersedes: none
---

# Sales Network (`domain-sales-network`) — Architecture Critique & Input

> Rolled up into the post-M3 program packet: `docs/plans/2026-06-04-ida-operating-model-sales-governance-program.md` (OMG-03/04/05/06/09).

> Status: **non-authoritative input.** This is an architecture assessment + proposal responding to the "rrjeti i shitjeve" document. It is NOT active work and does not modify the canonical plan/tracker. Promotion into the active queue requires the planning-governance flow (`current-program.md` / `current-tracker.md`). It does not change `apps/web/src/proxy.ts`, canonical routes, auth, tenancy, or billing provider (Paddle).

## Verdict

**Agree with the direction; agree with 8 required modifications before it becomes buildable.** The proposal is structurally consistent with the architecture we have been finalizing — its core rule ("sales gives commission, not claim access") is literally our attribution-vs-access invariant (ADR-05), and its AL-under-MK model is exactly our four-context tenant model. That is strong validation. The risk is **not** the concept; it is **building it greenfield** as a parallel attribution/commission/membership stack instead of extending the domains that already exist. Built on the existing seams it confirms the architecture; built parallel it breaks it.

This is a **new program**, not an Architecture-Finalization (M0–M5) tweak. It **depends on** the finalization spine and must be sequenced after it (see §7). It must not be injected into the M0–M5 tracker.

## Are we following a structural architecture? — Yes.

This document is good evidence that we are. Every rule the sales network needs already has a home:

| Sales-network requirement                          | Existing architectural home                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Sales role ≠ claim/document access                 | Attribution-read-only (ADR-05, T-306); `access_tenant_id` isolation (T-302b/c/d)         |
| Billing/commission bound to the right legal entity | Entity-of-record / `legal_tenant_id` billing (T-408, ADR-10/11)                          |
| AL sells now, invoices from MK, migrates later     | Four-context model: `market/booking/access/legal` (Rev 3) + entity migration (T-506/507) |
| Every sale audited / replayable                    | `domain_events` transactional outbox (M1)                                                |
| "Not insurance, no guarantee" on partner copy      | Brand/legal lint + protective message (T-007)                                            |
| Cross-tenant only via explicit handoff             | Case-scoped handoff (T-209) + Rev 6 case-scoped grant                                    |

The architecture is **generative**: a brand-new commercial vertical slots onto existing decisions without a redesign. That is the definition of structural. The discipline test is to _reuse_ those seams.

---

## 1. What already exists (grounding)

- **Packages:** `domain-agent` (agent member views), `domain-referrals` (`referrals`, `member-referrals`), `domain-crm`, `domain-leads`, `domain-membership-billing` (incl. `ownership-attribution.ts`: `createSelfServeOwnershipAttribution` vs `createAgentAssistedOwnershipAttribution`, `syncActiveAgentClientBinding`).
- **Schema:** `agent_settings`, `partner_discount_usage`, `agentClients` binding, `claims.agentId`/`branchId`; `commission_status` enum = `pending|approved|paid|void`; `commission_type` enum = `new_membership|renewal|upgrade|`**`b2b`** (the B2B revenue concept is already anticipated).
- **Membership system:** `subscriptions` / `membership_plans` / `membership_cards` — **there is no `membership` table.**
- **RBAC:** an `agent` role exists with `members.read` + **`claims.read`** (`packages/shared-auth/src/permissions.ts:72`).

So individual-agent + referral + commission scaffolding exists; the multi-channel **partner hierarchy + B2B/fleet + entitlements + partner portals do not.**

---

## 2. The non-negotiable invariant (and a concrete existing violation)

The document's rule — **selling grants commission, never claim/document/recovery access** — is correct and is our ADR-05 attribution-vs-access separation. It must be enforced structurally (role permissions + `access_tenant_id`), not by UI.

**Finding (P1, pre-existing): the current `agent` role already holds `claims.read`** (`permissions.ts:72`). That contradicts this invariant today — a sales actor can read member claims. Before any sales-network expansion, the sales/partner role family must be defined with **no** claims/document/recovery permissions, and the existing `agent` role's `claims.read` must be reviewed and removed or narrowed. This ties into the role de-collapse (T-301) and should be settled as part of M3, independent of whether the full network ships.

---

## 3. The consolidated model — extend, do not greenfield

Adopt the document's hierarchy, but bind it onto existing domains rather than a parallel stack:

```
Tenant → Branch/Region → Sales Channel → Partner Entity → Location → Sales User → Sale → Subscription → Commission
B2B:    Tenant → Corporate Account → Bulk Contract → Entitlements → Driver/Vehicle → Activation(→Subscription)
```

- **`domain-sales-network` owns:** partner hierarchy (`sales_partners`, `partner_locations`, `partner_users`, `partner_contracts`), `sales_codes` (hierarchical), `sales_campaigns`, corporate/fleet (`corporate_accounts`, `fleet_*`), `membership_orders`, `membership_entitlements`, and **commission calculation** (`commission_rules`, `commission_entries`).
- **Reuses, does not duplicate:** attribution primitives from `ownership-attribution` (extend self-serve/agent-assisted to partner/sub-code attribution); the existing `commission_status`/`commission_type` enums (incl. `b2b`); `domain-agent`/`domain-referrals` for the individual-agent and referral cases (these become the `DIRECT_AGENT` channel, not a new thing).
- **Partner types** (`DIRECT_AGENT, BROKER, TRAVEL_AGENCY, TECHNICAL_INSPECTION_STATION, RENT_A_CAR, FLEET_CORPORATE, ASSOCIATION_UNION, OTHER_CORPORATE_PARTNER`) are a discriminator on `sales_partners`, fine as proposed.

---

## 4. Required modifications (critique)

1. **Consolidate attribution + commission, don't fork.** Two attribution paths or two commission ledgers reintroduce the conflation the architecture fights. `domain-sales-network` must build on `ownership-attribution` + the existing commission enums, not beside them.
2. **Money movement stays in `domain-billing`.** `commission_settlement_batches`, `partner_invoices`, and payouts are money movement → owned by `domain-membership-billing` (entity-of-record + Paddle), triggered by a `sales.commission_earned` domain event — the same pattern as success-fee (T-204 / FLIGHT-08). Sales-network computes entries; billing settles and invoices.
3. **B2B entitlements map to the real membership system.** On activation, a `membership_entitlement` must produce a `subscription` bound to the driver/member, with `corporate_account` as payer/booking and `legal_tenant_id` as entity-of-record. Do not invent a parallel "membership" object. (`commission_type='b2b'` already exists to support this.)
4. **Sales events ride the existing outbox.** Drop the separate `sales_audit_events` table; emit `sales.*` events into `domain_events` (M1). One event stream, one timeline, one replay path.
5. **Fix the `agent` role first (§2).** Sales/partner roles get zero claims/document/recovery permissions; remove `claims.read` from `agent` or split a `sales`/`partner` role family without it.
6. **Sales-code prefix = market, not legal entity.** `MK/KS/AL` in `TENANT-CHANNEL-PARTNER-LOCATION-USER` is `market_country` for reporting/attribution; tenant/legal resolution stays server-side via `resolveTenantContext()`. The code must never re-become the "host=tenant=everything" selector. (The doc is already consistent on this; make it explicit and test it.)
7. **Settlement/commission lifecycle reuses event-driven, idempotent settlement.** `pending → earned → payable → paid`, `reversed` on refund/chargeback. Reuse the inbound webhook idempotency + `commercial_action_idempotency` pattern that already exists for Paddle, so refund→reversal is idempotent and replay-safe.
8. **Fleet-driver PII / DPA.** Corporate fleet admin sees activation status only (good — `access_tenant_id` + role), but driver PII (phone/email/plate) under a corporate relationship needs a data-processing agreement + consent model (the corporate account is a controller/processor relationship). Legal open decision.

---

## 5. Proposed ADRs (author at promotion time)

- **ADR-16 — Sales network attribution-vs-access.** Partner/sales roles grant commission attribution only; never claims/documents/recovery; `access_tenant_id` isolation; remove `agent.claims.read`.
- **ADR-17 — B2B entitlement → subscription.** Bulk purchase → `membership_entitlements` → activation produces a `subscription` (entity-of-record = `legal_tenant_id`, payer = `corporate_account`).
- **ADR-18 — Commission settlement via billing events.** Sales-network computes `commission_entries`; `domain-billing` settles/invoices/pays on `sales.commission_earned`; idempotent reversal on refund.
- **ADR-19 — Sales-code semantics.** Code prefix = `market_country`; resolution server-side; AL codes resolve to `legal_tenant_id=tenant_mk` during the shadow period.

---

## 6. AL-under-MK shadow model (well-aligned — adopt as-is)

The document's AL handling is the best-fit part and matches our four-context model + entity migration directly:

```
market_country     = AL
booking_tenant_id  = tenant_al_shadow   (reserved, created now)
legal_tenant_id    = tenant_mk          (invoices/contract from MK entity)
access_tenant_id   = tenant_mk          (data isolation under MK)
migration_ready_for = tenant_al         (controlled migration when AL entity opens)
```

This lets AL partners/sales be created now, tagged as AL market, invoiced from MK, and migrated cleanly later (T-506/T-507 entity migration with the active-case guard). Recommend adopting verbatim; it is strictly better than hiding AL inside MK with no marker.

---

## 7. Sequencing (Phase C discipline)

`domain-sales-network` is a **separate program gated on the finalization spine**, not an M0–M5 item:

- **Hard prerequisites:** `resolveTenantContext()` four-context (M3/T-302), `access_tenant_id` isolation + RLS (M3/T-302b–d), attribution-read-only (M3/T-306), `domain_events` outbox (M1), entity-of-record billing (M5/T-408).
- **Therefore:** do not start the network build mid-M0. Start after M3 (isolation/attribution) and reuse M5 billing. The only thing safe to do earlier is the **role fix in §2/§5** (belongs in M3 regardless) and reserving `tenant_al_shadow` (config).
- **Governance:** this stays an input until promoted as its own program via `current-program.md` (one active plan rule).

## 8. What NOT to do now

- Do not add 16 sales tables during Phase C / M0.
- Do not build partner portals before the role family + `access_tenant_id` isolation exist.
- Do not let any partner/fleet surface read claims/documents/recovery.
- Do not co-locate settlement/payout in sales-network (keep money in billing).
- Do not implement final commission percentages in code (keep `commission_rules` data-driven, as the doc says).

## 9. Open decisions

1. Role family: extend `agent` vs introduce distinct `partner_admin`/`partner_sales_user`/`corporate_admin` roles (recommend distinct, claims-free) — gates §2.
2. Fleet-driver DPA + consent model (legal).
3. Commission percentages per channel (business).
4. When to promote this program relative to M3/M5 completion.
5. Whether `DIRECT_AGENT` fully subsumes the existing `domain-agent`/`domain-referrals` or coexists during transition.
