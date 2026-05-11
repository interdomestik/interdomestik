---
status: design-review
date: 2026-05-11
slice: P35-DG02
title: Agent Dashboard Tenant Read Contract
owner: platform + security + qa
phase: Phase C
---

# P35-DG02 Agent Dashboard Tenant Read Contract

## Decision

`P35-SEC01 Commission Tenant Proof Contract` is closed after PR `#719` and Notion closeout sync.
P35 remains the active DB Access Posture Residual Hardening tranche.

The next bounded implementation slice is:

`P35-SEC02 Agent Dashboard Tenant Read Contract`

This gate promotes SEC02 because the largest coherent app-layer residual after SEC01 is the
five-entry legacy agent-dashboard claims read cluster in
`apps/web/src/actions/agent-dashboard/get.core.ts`. It is a single focused server-action read
contract and can be hardened without proxy, canonical route, auth architecture, tenancy
architecture, schema, Storage, Stripe, CRM, or broad DB posture changes.

## Inputs

| Input                                         | Relevance                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| PR `#719` / `P35-SEC01`                       | Merged the commission tenant proof contract and reduced the reviewed baseline from `unclassified=62` to `unclassified=61`.                  |
| `docs/security/db-access-posture-burndown.md` | Names the remaining legacy agent dashboard reads as the next coherent five-entry hard-case cluster, while still rejecting mass-stamping.    |
| `scripts/ci/db-access-baseline.json`          | Records five unclassified entries in `apps/web/src/actions/agent-dashboard/get.core.ts` before SEC02.                                       |
| `pnpm check:db-access`                        | Remains green, with known non-failing P34 CRM adapter drift that SEC02 must not refresh broadly.                                            |
| Focused dashboard tests                       | Existing tests cover agent empty-state behavior and staff dashboard reads; SEC02 can extend them for tenant proof and fail-closed behavior. |

## Promoted Slice

`P35-SEC02 Agent Dashboard Tenant Read Contract`

Implementation scope:

- Require staff/admin dashboard reads to have a session-derived, non-empty tenant scope.
- Preserve current agent-role behavior, which returns the existing empty dashboard DTO before
  claim reads.
- Add `claims.tenantId` predicates directly to every claim read in the dashboard core so the DB
  access guard can classify the calls as `tenant-predicate`.
- Add focused tests proving missing tenant scope fails closed before DB reads and staff/admin reads
  stay tenant-predicated.
- Update DB posture baseline and receipts only for the five reviewed dashboard entries.

Allowed touch points:

- `apps/web/src/actions/agent-dashboard/get.core.ts`
- `apps/web/src/actions/agent-dashboard/get.wrapper.test.ts`
- `scripts/ci/db-access-baseline.json`
- `docs/security/db-access-posture-baseline.md`
- `docs/security/db-access-posture-burndown.md`
- `docs/plans/**` for proof and closeout state

Must not touch:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- schema or migrations
- Storage redesign
- Stripe
- README, AGENTS, or broad architecture docs
- campaign, cron, public NPS, admin/branch, CRM, or one-off DB posture clusters

## Acceptance Criteria For SEC02

- Staff/admin dashboard reads call `ensureTenantId(session)` before any DB reads.
- Missing tenant scope throws before `db.select` or `db.query.claims.findMany` runs.
- All five dashboard claim reads include a direct `eq(claims.tenantId, tenantId)` predicate.
- Existing agent empty-state behavior is preserved.
- `pnpm check:db-access` passes with the reviewed baseline moving from `unclassified=61` to
  `unclassified=56`.
- Known P34 CRM adapter drift remains non-failing guard output and is not refreshed by this slice.

## Verification Plan

- Focused agent-dashboard unit tests.
- `pnpm check:db-access`.
- `pnpm security:guard`.
- `pnpm plan:status`.
- `pnpm plan:audit`.
- `pnpm track:audit`.
- `pnpm docs:verify`.
- `git diff --check`.
- `pnpm verify-slice -- --static`.
- `pnpm verify-slice -- --required-gates`.
- `interdomestik_qa.scope_audit` with the authorized paths.
- Diff-scoped Codex Security plugin scan.

## Non-Goals

- No product behavior expansion.
- No broad DB baseline burn-down.
- No mass-stamping `db-access-guard` directives.
- No proxy, route, auth, tenancy architecture, schema, migration, Storage, Stripe, README, AGENTS,
  or architecture-doc changes.
- No CRM continuation from P34.
