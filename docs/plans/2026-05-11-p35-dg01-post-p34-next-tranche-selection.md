---
status: design-review
date: 2026-05-11
slice: P35-DG01
title: Post-P34 Next Tranche Selection
owner: platform + security + qa
phase: Phase C
---

# P35-DG01 Post-P34 Next Tranche Selection

## Decision

`P35-DG01` opens `P35 DB Access Posture Residual Hardening` after completed `P34`.

The next bounded implementation slice is:

`P35-SEC01 Commission Tenant Proof Contract`

This gate promotes SEC01 because the strongest remaining repo-canonical security gap after P34 is
the post-SEC12 DB access posture residual set. The smallest coherent implementation target inside
that set is the single non-Paddle membership-billing commission ownership probe in
`packages/domain-membership-billing/src/commissions/create.ts`.

## Inputs

| Input                                                          | Relevance                                                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P34-DG04`                                                     | Closed the Domain CRM Production Roadmap with no new P34 slice and no P35 designation, requiring a fresh post-P34 selection gate before new work.                                                  |
| Recent PR history                                              | PRs `#709` through `#717` completed P34, while PR `#708` completed SEC12 and left the DB access posture baseline at `unclassified=62`.                                                             |
| Notion program search                                          | Confirms PR `#717` closeout is synced and current external program evidence mirrors the P33/P34 state.                                                                                             |
| `docs/security/db-access-posture-burndown.md`                  | Records the remaining `62` unclassified entries and explicitly prohibits mass-stamping.                                                                                                            |
| `scripts/ci/db-access-baseline.json`                           | Current committed baseline records `tenant-context=5`, `tenant-scoped=168`, `tenant-predicate=353`, `system-exempt=28`, and `unclassified=62`.                                                     |
| `pnpm check:db-access`                                         | Passes on `main`, scans `622` current entries, still reports `unclassified=62`, and identifies P34's CRM adapter changes as non-failing baseline drift that should be refreshed only after review. |
| `packages/domain-membership-billing/src/commissions/create.ts` | Contains the remaining non-Paddle membership-billing unclassified probe: fallback tenant lookup from `agentId` before commission insertion.                                                        |

## Current Evidence

The DB access posture guard remains green, but not complete. Current `main` has:

- `62` remaining unclassified DB access entries.
- One non-Paddle membership-billing commission ownership probe at
  `packages/domain-membership-billing/src/commissions/create.ts`.
- Five legacy agent-dashboard entries in `apps/web/src/actions/agent-dashboard/get.core.ts`.
- Campaign, cron, public NPS/engagement, admin/branch dashboard, and one-off residual clusters.
- P34 baseline drift where old route-local CRM entries disappeared and new `domain-crm` adapter
  entries are non-failing tenant-scoped or tenant-predicate entries. That drift should be refreshed
  only as part of a reviewed DB posture update, not as a standalone promoted product slice.

## Residual Ranking

| Rank | Candidate                                            | Decision | Rationale                                                                                                                                                                                                      |
| ---: | ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P35-SEC01 Commission Tenant Proof Contract`         | Promote  | Single coherent membership-billing hard case. The fallback agent lookup can be replaced with an explicit tenant contract without route, auth, tenancy architecture, schema, Stripe, or broad billing redesign. |
|    2 | Legacy agent dashboard tenant proof                  | Defer    | Coherent five-entry app-layer dashboard cluster, but broader than the commission probe and should follow the smallest billing-domain hard case.                                                                |
|    3 | Cron and public NPS/engagement tenancy               | Defer    | Needs a scheduled-job/public-token tenancy design before implementation; not safe as a quick classification slice.                                                                                             |
|    4 | Campaign execution and communication batch paths     | Defer    | Requires campaign/job-level ownership modeling and should not be mixed with billing commission proof.                                                                                                          |
|    5 | Admin and branch dashboard cross-tenant lookup paths | Defer    | Privileged/admin-facing and needs explicit admin-scope review.                                                                                                                                                 |
|    6 | Smaller one-off paths                                | Defer    | Too diffuse for one safe slice; SEC04B/DG14 mass-stamping rejection remains active.                                                                                                                            |
|    7 | CSP Phase 1 enforcement or SEC03 retry               | Reject   | DG07 remains unchanged and no concrete Next/CSP unlock condition has been recorded.                                                                                                                            |
|    8 | More CRM/P34 work                                    | Reject   | P34 is closed; DG04 promoted no additional CRM implementation slice.                                                                                                                                           |

## Promoted Slice

`P35-SEC01 Commission Tenant Proof Contract`

Implementation scope:

- Remove or harden the fallback `db.query.user.findFirst` tenant lookup in
  `packages/domain-membership-billing/src/commissions/create.ts`.
- Require an explicit non-empty `tenantId` for commission creation before idempotency checks or
  commission writes run.
- Preserve existing webhook and renewal callers that already pass canonical tenant scope.
- Update the app-facing commission action wrapper, if still needed, so any authenticated commission
  creation passes a session-derived tenant scope before calling the domain core.
- Add focused tests proving missing tenant scope fails closed before DB writes, existing tenant-scoped
  webhook/renewal paths still create commissions, and duplicate idempotency remains tenant-scoped.
- Update `scripts/ci/db-access-baseline.json` and DB posture receipts only for reviewed changes.

Allowed implementation touch points:

- `packages/domain-membership-billing/src/commissions/create.ts`
- `packages/domain-membership-billing/src/commissions/create.test.ts`
- `packages/domain-membership-billing/src/commissions/create-renewal*.ts`
- `packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/extras*.ts`
- `apps/web/src/actions/commissions*.ts` and focused tests only if the app wrapper needs to pass
  explicit tenant scope
- `scripts/ci/db-access-baseline.json`
- `docs/security/db-access-posture-baseline.md`
- `docs/security/db-access-posture-burndown.md`
- `docs/plans/**` for closeout proof

Must not touch:

- `apps/web/src/proxy.ts`
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`
- auth provider layering or session shape
- tenancy architecture
- schema or migrations
- Storage redesign
- Stripe
- README, AGENTS, or broad architecture docs
- legacy dashboard, campaign, cron, public NPS, admin/branch, or one-off DB posture clusters

## Acceptance Criteria For SEC01

- Commission creation does not perform an ambient agent-to-tenant lookup as a fallback.
- Missing `tenantId` returns a stable error before idempotency queries, inserts, or audit side
  effects run.
- Existing webhook and renewal commission flows still pass explicit tenant scope and preserve
  current commission idempotency behavior.
- `pnpm check:db-access` passes with no new failing direct DB access and the reviewed baseline
  records the resolved commission hard case.
- Any DB posture baseline refresh for P34 adapter drift is reviewed and documented; it must not
  classify unrelated residual clusters.

## Verification Plan

DG01 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm verify-slice -- --static`
- `interdomestik_qa.scope_audit` with changes limited to `docs/plans/**`

SEC01 is an implementation slice and must additionally run:

- focused commission unit tests
- focused app action wrapper tests if wrapper scope changes
- `pnpm check:db-access`
- `pnpm security:guard`
- mandatory implementation reviewer pool
- diff-scoped Codex Security plugin scan
- `pnpm verify-slice -- --required-gates`

## Non-Goals

- No product behavior expansion.
- No broad DB baseline burn-down.
- No mass-stamping `db-access-guard` directives.
- No proxy, route, auth, tenancy architecture, schema, migration, Storage, Stripe, README, AGENTS,
  or architecture-doc changes.
- No CRM continuation from P34.
