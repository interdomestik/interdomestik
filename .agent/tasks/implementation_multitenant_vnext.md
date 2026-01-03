# Interdomestik vNext: Multi-tenant Implementation Plan

Status: Active
Owner: Product + Engineering

Purpose: Turn Interdomestik into a multi-tenant platform with strict data isolation, tenant-specific payments, and country-specific rules.

---

## Scope (vNext)

- Multi-tenant foundation (MK + KS) with full data separation.
- Tenant-specific payments, invoices, and reporting.
- RBAC with tenant and branch scoping.
- Rules engine for pricing, products, legal docs, and workflows.
- Audit logging + import/export for existing MK data.

Out of scope for this plan:
- Albania tenant (future expansion).
- Mobile app.

---

## Core Decisions (confirmed)

1) Single database with tenant_id on all domain tables.
2) Canonical tenants:
   - tenant_mk (country_code: MK)
   - tenant_ks (country_code: XK)
3) Users belong to one tenant only; super_admin is cross-tenant.
4) Drizzle is the single source of truth for schema.
5) Shared storage bucket with tenant-scoped paths:
   - pii/tenants/<tenant_id>/...
6) Payment provider per tenant (Paddle).

---

## Architecture Notes

- App-level tenant scoping is mandatory for all queries.
- Optional defense-in-depth RLS on domain tables using:
  - SET LOCAL app.current_tenant_id = <tenantId> inside a transaction.
- Storage paths include tenant_id: pii/tenants/<tenant_id>/...
- Webhooks route by tenant (provider account or secret per tenant).

---

## Phase 0: Alignment (Week 0)

Deliverables:
- Final tenancy rules + data ownership matrix.
- Table list for tenant scoping.
- Tenant seed data (MK, KS).

Acceptance criteria:
- Tenancy model agreed and documented.

---

## Phase 1: Tenant Foundation (Weeks 1-2)

Database (Drizzle):
- Create tenants table.
- Create tenant_settings table (or standardize tenant config location).
- Add tenant_id to core tables:
  user, memberships, claims, policies, payments, documents, notifications, etc.
- Backfill existing data to tenant_mk.
- Add indexes on tenant_id.
- Enforce NOT NULL after backfill.

App:
- Add tenant_id to session payload.
- Introduce tenant-aware DB helper (transaction + SET LOCAL).
- Enforce tenant scoping on all domain reads/writes.

Acceptance criteria:
- All domain queries require tenant_id.
- No cross-tenant reads are possible via app layer.

---

## Phase 2: RBAC + Branch Scoping (Weeks 3-4)

Database:
- branches table.
- user_roles table with tenant_id and optional branch_id.

App:
- Roles: super_admin, tenant_admin, branch_manager, agent, promoter, member.
- Policy checks on all admin and staff routes.
- Branch dashboards for member tracking and performance.

Acceptance criteria:
- Admin MK cannot access KS data.
- Branch managers only see their branch scope.

---

## Phase 3: Payments + Invoicing per Tenant (Weeks 5-6)

Database:
- payment_accounts table (provider + tenant).
- invoices table (tenant-scoped).
- ledger/transactions table (tenant-scoped).

App:
- Payment provider configuration per tenant (Paddle).
- Webhook handler uses tenant routing + idempotency.
- Invoice generation uses tenant legal details.

Acceptance criteria:
- Payments route to tenant account.
- Revenue reports are tenant-specific.

---

## Phase 4: Rules Engine + Admin Settings (Weeks 7-8)

Database:
- tenant_settings entries for pricing/products/legal/workflows.

App:
- Settings UI for tenant admins.
- Runtime rules lookups (pricing, workflows, legal text).

Acceptance criteria:
- MK/KS pricing and workflow rules configurable without code changes.

---

## Phase 5: Audit + Import/Export (Weeks 9-10)

Database:
- audit_logs table with tenant_id, actor, action, changes.

Tools:
- CSV import with field mapping and duplicate checks.
- Tenant-scoped exports (CSV/PDF).

Acceptance criteria:
- Full audit trail with tenant scope.
- MK historical data import path verified.

---

## Phase 6: Validation + Rollout (Weeks 11-12)

Testing:
- Tenant isolation tests (app + optional RLS).
- Payment routing tests (sandbox).
- Migration dry-run.

Release:
- Feature flags for tenant-related changes.
- Rollback plan documented.

Acceptance criteria:
- Isolation and payments verified; no cross-tenant data access.

---

## Open Questions

- Finalize tenant legal details for seed data (legal_name, address, tax_id, contact).
- Decide if any content should be global across tenants (templates, legal docs).
- Confirm if tenant-specific storage buckets are needed later (keep shared bucket for vNext).

---

## Update Log

- 2026-01-02: Decisions confirmed; roadmap synced for vNext execution.
