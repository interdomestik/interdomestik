# Execution Plan — Multi‑Tenant + Branch + Agent v1 (Repo‑Aligned)

This is a file-by-file execution plan aligned to your current repo state (Drizzle schema + SQL migrations + domain packages + tests). It assumes the **operational rules** we discussed:

- **Tenant = Country** (MK, XK, later AL)
- **Branches are within a tenant**
- **Agents recruit/sell memberships** (sales-only)
- **Staff handle claims** (fulfillment)

Primary source docs:

- `.agent/tasks/implementation_multitenant_vnext.md`
- `ROADMAP.md` (role model + phases)

Progress tracking:

- Use `[ ]` for next/todo, `[x]` for done.
- Keep the plan text as-is; only toggle the boxes.

---

## 0) Baseline: what already exists (don't redo)

**Drizzle schema (already tenant/branch aware)**

- `packages/database/src/schema/tenants.ts` (tenants + tenant_settings)
- `packages/database/src/schema/rbac.ts` (branches + user_roles)
- `packages/database/src/schema/auth.ts` (user.tenantId + user.branchId)
- `packages/database/src/schema/memberships.ts` (subscriptions.tenantId + branchId + agentId)
- `packages/database/src/schema/claims.ts` (claims.tenantId + branchId + agentId + staffId)
- `packages/database/src/schema/agents.ts` (agent_clients + commissions + settings)
- `packages/database/src/schema/relations.ts` (tenant/branch/user/claim/subscription relations)

**SQL migrations (already applied in E2E flow)**

- `packages/database/drizzle/0008_add_multitenant.sql`
- `packages/database/drizzle/0009_add_branches_rbac.sql`
- `packages/database/drizzle/0010_add_branch_scoping.sql`
- `packages/database/drizzle/0011_refine_branch_schema.sql`
- `packages/database/drizzle/0012_seed_default_branch_settings.sql`

**Scoping helpers (already present)**

- `packages/shared-auth/src/scope.ts` (`scopeFilter`)
- `packages/shared-auth/src/session.ts` (`ensureTenantId`)
- `packages/database/src/tenant.ts` (`withTenantContext` for defense-in-depth)

**Existing critical E2E coverage**

- `apps/web/e2e/branches.spec.ts` (branch CRUD)
- `apps/web/e2e/rbac.spec.ts` (route-level access restrictions)
- `apps/web/e2e/claim-submission.spec.ts` (member claim creation)

---

## 1) Phase A — Tenant enforcement & cross-tenant guardrails (Effort: S)

### A1. [x] Confirm tenant scoping is mandatory for ALL domain queries

**Goal:** every domain query is tenant-scoped (and branch/agent scoped when required).

**Sub-checklist (mark these as you verify them)**

- [x] `listClaims` always enforces `claims.tenantId = scope.tenantId`
- [x] `getUsersCore` always enforces `user.tenantId = scope.tenantId`
- [x] `handleSubscriptionChanged` resolves tenant safely (no cross-tenant writes)

**Files to review/adjust (domain level)**

- `packages/domain-claims/src/claims/list.ts` (already enforces `claims.tenantId = scope.tenantId`)
- `packages/domain-users/src/admin/get-users.ts` (already enforces `user.tenantId = scope.tenantId`)
- `packages/domain-users/src/admin/rbac.ts` (`resolveTenantId` already blocks non-super-admin cross-tenant ops)

**Defense-in-depth (optional but recommended)**

- If you want DB-level protection, standardize domain reads/writes to use `withTenantContext()` from `packages/database/src/tenant.ts` for sensitive operations (claims, subscriptions, user role grants).

**Selective tests (unit)**

- If you change `scopeFilter()` or `resolveTenantId()`:
  - Update/add unit tests close to the calling surface in web:
    - `apps/web/src/actions/admin-rbac.wrapper.test.ts`
    - Any `_core.test.ts` for admin/staff pages that pass tenantId explicitly

---

## 2) Phase B — Branches (CRUD + tenant scoping) (Effort: S)

### B1. [ ] Keep branch CRUD logic centralized in domain-users

**Source of truth**

- Branch CRUD: `packages/domain-users/src/admin/rbac.ts`
- Web action wrapper: `apps/web/src/actions/admin-rbac.core.ts`

**UI entrypoints to confirm (no behavior changes unless needed)**

- Admin branches route(s) live under `apps/web/src/app/[locale]/admin/branches/**`

**Data integrity (already in schema/migrations)**

- Uniqueness per tenant: `branches_tenant_slug_uq` and `branches_tenant_code_uq` in Drizzle schema + SQL migrations.

**Selective tests**

- E2E (already exists, keep as the one test for this feature): `apps/web/e2e/branches.spec.ts`
- Unit (only when logic changes in branch CRUD):
  - `apps/web/src/actions/admin-rbac.wrapper.test.ts`

---

## 3) Phase C — Role assignment + branch-scoped roles (Effort: M)

### C1. [ ] Standardize "branch required" roles

**Current behavior:** `grantUserRoleCore()` enforces branch requirement for `branch_manager` and `agent`.

**Files**

- Role logic: `packages/domain-users/src/admin/rbac.ts`
- Permissions source: `packages/shared-auth/src/permissions.ts` (use `tenant_admin`, `branch_manager`)
- Scope derivation: `packages/shared-auth/src/scope.ts`
- Role-scoped user listing: `packages/domain-users/src/admin/get-users.ts`

**UI that typically needs updates when role model changes**

- `apps/web/src/app/[locale]/admin/users/[id]/_components/admin-user-roles-panel.tsx` (role assignment UI)

**Selective tests**

- Unit (always add/update when access rules change):
  - Add tests that cover "role requires branchId" and "cannot assign to inactive branch" by testing the _domain_ function indirectly via existing action tests:
    - `apps/web/src/actions/admin-rbac.wrapper.test.ts` (wrapper behavior)
    - Add a new focused unit test file in web actions if you change validation branches/role rules (prefer this over setting up a new vitest harness inside domain packages).

- E2E (one test for this feature, only if you change the UX):
  - Add **one** E2E that proves an admin can assign an agent role with a branch and the user can access `/agent` afterwards.
  - Suggested new spec: `apps/web/e2e/role-assignment.spec.ts` (single critical path).

---

## 4) Phase D — Agent ownership (members) vs claim handling (staff) (Effort: M)

### D1. [ ] Treat agent->member ownership as canonical via `agent_clients`

**Why:** it stays stable even if subscriptions churn/renew.

**Files**

- Table: `packages/database/src/schema/agents.ts` (`agentClients`)
- Relations: `packages/database/src/schema/relations.ts` (`agentClientsRelations`)

**Potential DB hardening (if your checklist includes it)**

- Add a uniqueness constraint to prevent duplicates:
  - New Drizzle change: `packages/database/src/schema/agents.ts` (unique index on tenantId+agentId+memberId)
  - New SQL migration under `packages/database/drizzle/0013_*.sql`

**Selective tests (unit)**

- Only if you change the scoping rules for agent visibility:
  - Add/update a unit test around the relevant action/core (agent clients listing), e.g. under `apps/web/src/actions/agent-*.test.ts`.

### D2. [x] Ensure subscriptions carry branch + agent (routing inputs)

**Current behavior:** Paddle webhook handler sets `subscriptions.agentId` and derives `subscriptions.branchId` from the agent's `user.branchId`.

**Files**

- Webhook handler: `packages/domain-membership-billing/src/paddle-webhooks/handlers/subscriptions.ts`
- Subscription schema: `packages/database/src/schema/memberships.ts`

**Gap to decide (usually part of the checklist)**

- What happens for **self-serve** members (no agentId)?
  - Recommended: set `subscriptions.branchId` to tenant's **default branch**.
  - Prefer `tenant_settings(category='rbac', key='default_branch_id')` as canonical source (keeps tenant table stable and matches what you already have in schema).

**Guardrail (important)**

- Do not default `tenantId` (e.g. to `tenant_mk`) if it can't be resolved.
- If a webhook event cannot be mapped to a tenant (via existing subscription or the user record), log and abort the write.

**Implementation options (pick 1, simplest first)**

**Decision (choose 1 to avoid stalling execution)**

- [x] Option 1: `tenant_settings(category='rbac', key='default_branch_id')` (chosen path)
- [ ] Option 2: `tenants.default_branch_id` column (defer)
- [ ] Option 3: Convention (`code='main'`) (defer)

1. **Tenant setting** ✅ (Chosen): store `tenant_settings(category='rbac', key='default_branch_id')` and read it in `subscriptions.ts` handler.
   - Update: `packages/database/src/schema/tenants.ts` (already supports tenant_settings)

- [x] Add migration: `packages/database/drizzle/0012_seed_default_branch_settings.sql`
- [x] Add a unit test for webhook default-branch behavior: `apps/web/src/lib/paddle-webhooks/subscriptions-handler.test.ts`

2. **Tenant column**: add a first-class `defaultBranchId` on tenants.
   - Update: `packages/database/src/schema/tenants.ts` (add `defaultBranchId: text('default_branch_id').references(() => branches.id)`)
   - Add migration: `packages/database/drizzle/0012_add_default_branch_to_tenants.sql`
   - Backfill strategy: set the default for existing tenants based on a known branch (from `scripts/seed-branches-manual.mjs`) or a one-time manual update.
3. **Convention**: pick the branch with `code='main'` (or similar) per tenant.
   - This is simpler but becomes brittle once you add more branches/countries.

**Selective tests (unit)**

- If you implement default-branch routing logic:
  - Add a unit test for the webhook handler behavior (tenant default branch applied when agentId is missing).
  - Suggested location (fastest): an existing web/unit test suite that already mocks db + handler deps, or add a focused test near the handler if you already have vitest set up for that package.

---

## 5) Phase E — Claim creation routing + staff queue visibility (Effort: M)

### E1. [x] Make claim routing deterministic from subscription

**Current behavior:** claim inherits `branchId` + `agentId` from active subscription.
**Important:** Treat these as **snapshots** at claim creation. Agent visibility should be based on
`agent_clients` ownership for current access, while `claims.agent_id` remains historical attribution.

**Files**

- Claim create: `packages/domain-claims/src/claims/create.ts` (sets `branchId: subscription.branchId`, `agentId: subscription.agentId`)
- Claims table: `packages/database/src/schema/claims.ts`

**Selective tests**

- Unit (logic change => always):
  - Extend `apps/web/src/actions/claims.test.ts` to assert inserted claim includes the expected `branchId`/`agentId` when you add/modify that logic.

- E2E (one test for this feature, critical path):
  - Add a new minimal test proving: **member submits claim → staff sees it in queue**.
  - Suggested new spec: `apps/web/e2e/claim-routing.spec.ts`
    - Step 1: member creates claim with unique title
    - Step 2: staff opens `/staff/claims` and searches/locates that title
    - Stop there (do not test full status workflow; keep it stable)

### E2. [ ] Agent visibility policy (explicit decision)

**Problem to decide:** should an agent's “queue/visibility” be based on the historical snapshot (`claims.agentId`) or on canonical ownership (`agent_clients`)?

- [ ] Defer (v1): keep agent visibility based on `claims.agentId` only (snapshot semantics)
- [ ] Adopt (v2+): change agent visibility to derive from `agent_clients` (canonical ownership)

**Where this shows up in code**

- Listing entrypoint: `packages/domain-claims/src/claims/list.ts` (scope `agent_queue`)
- Ownership model: `packages/database/src/schema/agents.ts` (`agent_clients`)

---

## 6) Seed/backfill plan (keep environments deterministic) (Effort: S)

### F1. [x] Tenants are already seeded in migration

- Tenants inserted in: `packages/database/drizzle/0008_add_multitenant.sql`

### F2. [x] Branch seed

- Manual branch seed script already exists: `scripts/seed-branches-manual.mjs`
  - [x] Seed now also upserts `tenant_settings(category='rbac', key='default_branch_id')` for the tenant.

### F3. [ ] E2E users + seeded claims

- `scripts/seed-e2e-users.mjs`

**Recommended use**

- For local/dev + CI: ensure branch seed runs before E2E if tests depend on specific branches.
- Only run backfills if you introduce **branch-scoped staff queues** or add UI filters that assume every claim has `branch_id`/`agent_id` set.
  - Today, staff is **full-tenant scope** in `packages/shared-auth/src/scope.ts`, so claims with `branch_id = NULL` are still visible.

---

## 7) Known repo gotchas (worth checking early)

These aren't extra scope—just things that can silently break the intended model.

- [x] **Claim assignment naming drift**: there are both staff-claim and agent-claim assign handlers; verify they set the correct column.
  - Check `packages/domain-claims/src/agent-claims/assign.ts` and `packages/domain-claims/src/staff-claims/assign.ts` for accidental `staffId` updates using an agent id.
- [ ] **Routing "source of truth"**:
  - Claim creation snapshots `branchId`/`agentId` from the active subscription in `packages/domain-claims/src/claims/create.ts`.
  - Ongoing agent visibility should be based on `agent_clients` ownership if you want it to survive subscription churn.
  - This decision is tracked explicitly in **Phase E2**.
- [ ] **Staff queue scoping decision**:
  - Currently staff is **full-tenant scope** in `packages/shared-auth/src/scope.ts`.
  - **Decision needed**: Should staff become branch-scoped in a future phase? Marking as "not now" is a valid choice, but should be explicit.

---

## 8) "Selective tests" rule of thumb (your velocity policy)

Apply these rules per task:

- **Access rules / scoping / permissions** (tenant/branch/agent filters, role checks):
  - Always add/update **at least 1 unit test** near the boundary you changed.
  - Prefer existing web-side tests (they're already wired):
    - `apps/web/src/actions/admin-rbac.wrapper.test.ts`
    - `apps/web/src/actions/claims.test.ts`
  - **Hygiene tip (focused unit runs):** run only the specific test files you touched to avoid getting blocked by unrelated failing suites:
    - `pnpm --filter @interdomestik/web exec vitest run <path/to/test-file> <path/to/other-test-file>`
    - Example:
      - `pnpm --filter @interdomestik/web exec vitest run src/actions/agent-claims.test.ts src/actions/agent-claims.wrapper.test.ts`

- **UI + flow changes** (branches UI, role assignment UI, claim routing UI):
  - Add **only 1 E2E per feature** (or keep the existing one):
    - Branches CRUD: keep `apps/web/e2e/branches.spec.ts`
    - Role assignment: add `apps/web/e2e/role-assignment.spec.ts` only if UX changes
    - Claim routing: add `apps/web/e2e/claim-routing.spec.ts`

- **Small refactors** (renames/moves) with no behavior change:
  - No new tests.

---

## 9) Implementation order (fastest path)

- [x] Confirm tenant scoping for the 3 primary data entrypoints:
  - user listing (`getUsersCore`)
  - claim listing (`listClaims`)
  - subscription webhook upsert (`handleSubscriptionChanged`)
- [x] Decide default branch strategy for self-serve members.
- [x] Implement default-branch routing (if needed) + one unit test.
- [x] Add minimal "member claim → staff queue" E2E.
- [ ] Only then expand to more branches/roles/tenants.

---

## 10) Rollback & Risk Mitigation

> [!WARNING]
> Always test migrations in a staging environment before production. Keep backups of production data before running any migration.

### Migration Rollback Strategy

- **Before each migration**: Ensure you have a database backup or snapshot.
- **Drizzle rollback**: If a migration fails mid-way, use `drizzle-kit drop` to revert the failed migration, fix the issue, and re-run.
- **Data migrations**: For backfill scripts, always run in a transaction with `ROLLBACK` option first (dry-run mode) before committing.

### Feature Flags (Recommended for Gradual Rollout)

- **Default-branch routing**: Consider adding a feature flag `ENABLE_DEFAULT_BRANCH_ROUTING` in environment variables.
  - If `false`: skip default-branch assignment (existing behavior).
  - If `true`: apply new routing logic.
  - This allows safe rollout and quick rollback without code changes.

### CI/E2E Dependency Chain

The correct run order for CI and local E2E:

```bash
# 1. Apply migrations
pnpm db:migrate

# 2. Seed branches (must run before E2E if tests depend on specific branches)
node scripts/seed-branches-manual.mjs

# 3. Seed E2E users
node scripts/seed-e2e-users.mjs

# 4. Run E2E tests
pnpm test:e2e
```

- **Playwright globalSetup**: Consider adding these seed steps to `playwright.config.ts` → `globalSetup` for full automation.
