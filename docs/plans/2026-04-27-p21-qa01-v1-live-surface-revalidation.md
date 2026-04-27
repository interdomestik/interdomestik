# P21-QA01 v1.0.0 Live Surface Revalidation

**Status:** proposed design slice  
**Date:** 2026-04-27  
**Purpose:** final live-entry confidence pull before post-v1 product expansion

## Goal

Prove that the declared v1.0.0 app serves the launch-critical public, member, agent,
staff, admin, CRM, and tenant-bound surfaces correctly, catches release-blocking
regressions, and records any remaining bugs or gaps before broader live operation.

This is a verification and hardening slice. It is not a CRM redesign, agent-workspace
redesign, portal restructuring, auth refactor, route rename, proxy refactor, schema change,
Stripe reintroduction, or product analytics tranche.

`apps/web/src/proxy.ts` remains read-only unless a concrete live-entry blocker is found,
documented with reproduction evidence, and explicitly authorized for a separate fix.

## Source-Grounded Risks

1. **Host-to-tenant resolution must match live traffic.** `apps/web/src/lib/proxy-logic.ts`
   resolves tenant context from `host` and then sets `TENANT_COOKIE_NAME`; lower-level
   tenant helpers also recognize configured hosts and local `*.127.0.0.1.nip.io` hosts.
   Revalidation must prove the pilot host maps to `pilot-mk` and does not silently fall back
   to the default public tenant.
2. **Protected-route bounce must happen before layout-level notFound guards.** Agent, staff,
   and admin layouts use `requireEffectivePortalAccessOrNotFound(...)` after session
   resolution. Anonymous users should be redirected to `/{locale}/login` by the proxy guard,
   not see a generic 404 from a Node layout guard.
3. **Unified agent/member access needs explicit UX proof.** The member layout permits
   `member`, `user`, and `agent` roles. Revalidation must prove an agent can move through the
   allowed member context and back to agent work without losing session or landing in an
   ambiguous 404 state.
4. **Payment environment posture must be checked.** Pricing may show local checkout warnings
   when Paddle public config is unavailable in non-production mode. In production Paddle mode,
   revalidation must prove local/sandbox warning text is suppressed and checkout config either
   initializes or fails as a clear release blocker.
5. **The E2E surface is large.** Revalidation must focus on deterministic `gate`, `golden`,
   and targeted live-surface specs. Quarantined or known-flaky specs are not part of the
   release decision unless they are intentionally promoted by this slice.

## Scenario Matrix

### 1. Public Entry Smoke

- [ ] Public homepage or acquisition entry serves without 500s.
- [ ] Free Start entry serves and still reaches the claim-pack generation path.
- [ ] `/pricing` serves and keeps coverage matrix, fee calculator, disclaimers, refund/cooling-off
      terms, and V3 billing posture visible.
- [ ] `/services` serves and remains aligned with coverage/referral boundaries.
- [ ] Active V3 pilot surfaces do not reintroduce Stripe copy or Stripe checkout paths.

### 2. Host-To-Tenant Smoke

- [ ] Deterministic local pilot host, such as `pilot.127.0.0.1.nip.io`, resolves to `pilot-mk`.
- [ ] Production-equivalent pilot host from `PILOT_HOST` or canonical pilot host resolves to
      `pilot-mk`.
- [ ] Response sets `TENANT_COOKIE_NAME` to the resolved tenant.
- [ ] Tenant-specific content, locale behavior, and branding-sensitive shell data render without
      falling back to the default public tenant.
- [ ] A non-tenant host uses only the documented public fallback path and does not gain protected
      tenant access.

### 3. Auth And Role Routing Matrix

- [ ] Anonymous `/member`, `/agent`, `/staff`, and `/admin` requests redirect with `307` to
      `/{locale}/login` and include the proxy auth-guard signal where expected.
- [ ] Anonymous `/staff/claims` and `/admin/overview` do not return a layout-level 404.
- [ ] Member can access member surfaces and cannot access agent, staff, or admin surfaces.
- [ ] Agent can access `/agent`, `/agent/crm`, and permitted member context, but not staff/admin.
- [ ] Staff can access staff claim operations, but not admin-only surfaces.
- [ ] Admin can access admin custody surfaces.
- [ ] Existing `*-page-ready` markers remain present where contracted.

### 4. Dashboard Serve Verification

- [ ] `/member`: dashboard loads for empty and seeded member states; guidance/status components do
      not crash.
- [ ] Member claim detail loads progress, latest public update, trust/SLA clarity, and support
      handoff.
- [ ] `/agent`: dashboard loads and CRM KPI reads resolve through tenant-scoped read contracts.
- [ ] `/agent/crm`: list and lead-detail routes serve own-tenant data without 500s.
- [ ] `/staff`: claim queue and claim-detail surfaces serve seeded claims.
- [ ] `/admin`: admin overview and decision-custody surfaces serve.
- [ ] Group/branch surfaces are included only if their existing route contracts mark them as
      launch-critical for v1.0.0.

### 5. Unified Agent Context-Switch Proof

- [ ] Agent logs in through the auth fixture using the project base URL and tenant headers.
- [ ] Agent lands on `/agent` or an existing agent member/CRM entrypoint.
- [ ] Agent navigates into an allowed member surface such as `/member/claims/new`.
- [ ] The member-context action either clearly acts as the agent's own member context or blocks
      with a clear expected contract; no ambiguous ownership or tenant leakage is allowed.
- [ ] Agent returns to the agent workspace/CRM surface using UI navigation without losing session,
      tenant context, or readiness markers.

### 6. Tenant And Boundary Negative Proof

- [ ] Cross-role dashboard access is rejected with the expected redirect or not-found contract.
- [ ] Cross-tenant CRM reads and writes stay blocked.
- [ ] Missing tenant or session identity on hardened APIs returns expected contract errors, not
      generic 500s.
- [ ] Claim/evidence upload and share-pack surfaces preserve server-issued intent and ownership
      checks from the production-professionalism hardening line.

### 7. Core Workflow Smoke

- [ ] Free Start claim-pack generation still produces the expected generated pack.
- [ ] Staff claim queue renders seeded claims and stage/SLA/matter evidence remains visible.
- [ ] Agent CRM read path works for own tenant and own agent identity.
- [ ] Legacy agent CRM status and activity mutations still enforce tenant plus agent ownership.
- [ ] Critical lifecycle notification wiring is not broken by release-state/version changes.

### 8. Payment Environment Proof

- [ ] With non-production Paddle settings and missing local public config, pricing may show the
      documented local checkout warning.
- [ ] With `NEXT_PUBLIC_PADDLE_ENV=production`, local/sandbox warning copy is suppressed.
- [ ] If production Paddle config is missing or invalid, the failure is classified as blocker with
      exact environment and reproduction evidence.

## E2E Selection Rules

- Prefer existing deterministic `apps/web/e2e/gate/**` and `apps/web/e2e/golden/**` coverage.
- Add only narrow missing Playwright specs for live-surface gaps identified by this plan.
- Do not promote `quarantine` specs into the release decision unless a specific quarantined case is
  first stabilized or rewritten as a deterministic gate/golden scenario.
- Use existing `auth.fixture.ts` helpers and project host configuration for authenticated role and
  tenant scenarios.
- Attach Playwright trace, screenshot, or exact reproduction steps for every blocker or must-fix
  finding.

## Findings And Bug Classifications

### Blocker

Must fix before live traffic.

- Any launch-critical dashboard 500.
- Any protected surface fail-open.
- Any cross-tenant data exposure.
- Any production Paddle configuration failure when production checkout is required for the launch
  path.

### Must-Fix

Fix in this PR if small, otherwise create an explicit pre-traffic follow-up.

- Missing readiness marker on a launch-critical surface.
- Anonymous protected route returning layout 404 instead of login redirect.
- Unified-agent context ambiguity that could cause wrong ownership or user confusion.
- Missing deterministic E2E coverage for a launch-critical dashboard.

### Follow-Up

Safe post-live backlog item.

- Cosmetic dashboard polish.
- Non-critical empty-state copy improvements.
- Broader CRM product expansion.
- Agent-workspace redesign.
- Analytics expansion.

### Not In Scope

- `apps/web/src/proxy.ts` edits without explicit authorization.
- Canonical route renames.
- Auth, routing, tenancy, or portal architecture refactors.
- Database schema redesign.
- Stripe reintroduction.
- Broad CRM or agent-workspace redesign.

## Acceptance Criteria

- Launch-critical dashboards and public entry surfaces serve without 500s.
- Host-to-tenant resolution is proven for deterministic local and production-equivalent pilot host
  paths.
- Anonymous protected-route bounce is proven as login redirect, not layout 404.
- Role, session, and tenant boundaries are reconfirmed.
- Unified agent/member context switching is either proven behavior-compatible or classified with a
  concrete fix requirement.
- Paddle production-mode warning suppression is proven or the missing production checkout contract
  is classified as blocker.
- Any blocker or must-fix finding includes trace/screenshot/reproduction evidence using existing
  auth and host fixtures.
- Tracker and Notion closeout record PR number, merge SHA, verification evidence, and final
  live-entry readiness status.

## Verification Order

1. Focused new or updated E2E tests for gaps in the scenario matrix.
2. Focused route/component/unit tests for any bug fixes made in-slice.
3. `pnpm pr:verify`
4. `pnpm security:guard`
5. `pnpm e2e:gate`
6. `pnpm verify-slice -- --static`
7. Pre-PR reviewer pool with QA, security, and architecture reviewers.
8. Fix all blocker and must-fix findings or explicitly block live-entry with evidence.
9. `pnpm verify-slice -- --required-gates`

## Live-Entry Decision

Passing this slice reconfirms v1.0.0 as ready for controlled live operation on the verified
surfaces. It does not authorize broad post-v1 product expansion by itself; the first post-live
product tranche still requires a separate repo-canonical design gate.
