---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-02
tracker_id: T-002
---

# ARCH-M0-12 Admin Transition Writer Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M0-12`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-02
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-11`.

## Closeout Basis

`ARCH-M0-11` landed in PR `#903` with squash merge commit
`03aef88b41efef6a33cad289bdde44f38e8c969e`, completing `T-011` by
recording the Playwright host-as-tenant lane inventory and proving the
repo-native guard that blocks new dashboard/auth E2E specs from relying on
hostnames as tenant identity.

The merged slice preserves the Phase C routing and tenancy boundaries:
`apps/web/src/proxy.ts` stayed read-only, canonical routes stayed `/member`,
`/agent`, `/staff`, and `/admin`, and the country-host Playwright lanes remain
explicit alias/regression coverage instead of a runtime tenant-identity
contract.

## Promoted Slice

Promote `ARCH-M0-12 -- Admin Claim Status Transition Writer Adoption`.

Tracker task: `T-002`.

Goal: route the package admin claim-status writer through the existing
`transitionClaimStatus()` command as the next bounded `T-002` adoption step.

## Current Evidence

- `T-002` remains the active M0 task requiring the runtime writers from the
  `T-000` inventory to use the sole transactional `transitionClaimStatus()`
  command.
- `ARCH-M0-03` already routed the staff package writer through the transition
  command, proving the first bounded adoption step while preserving staff
  behavior, tenant scoping, actor context, lifecycle updates, and focused
  tests.
- `ARCH-M0-09` converted `packages/domain-claims/src/claims/status.ts` to the
  package `ActionResult` contract, reducing error-contract drift before further
  writer adoption.
- `ARCH-M0-10` recorded ADR-04, which names `canTransition(...)` and
  `transitionClaimStatus()` as the sole claim-status transition architecture.
- `docs/plans/2026-05-31-arch-m0-01-writer-inventory.md` identifies
  `packages/domain-claims/src/admin-claims/update-status.ts` /
  `updateClaimStatusCore` as the direct admin bypass named by the tracker.

## Scope

- Inspect the existing admin writer, transition command, staff adoption pattern,
  writer guard, and focused domain tests before changing runtime code.
- Route only `packages/domain-claims/src/admin-claims/update-status.ts` through
  `transitionClaimStatus()`.
- Preserve the package admin API behavior, `ActionResult` shape, existing error
  strings where applicable, tenant scoping, actor context, lifecycle-version
  behavior, history write behavior, and transition rejection behavior.
- Add focused tests proving admin success and rejection behavior through the
  transition command.
- Tighten or update the claim-status writer guard only if the implementation
  requires a narrow, explicit policy change.

## Out Of Scope

- Do not start the app-local admin ops writer in
  `apps/web/src/features/admin/claims/actions/ops-actions.ts`.
- Do not start agent writer adoption, draft cancellation adoption, the legacy
  helper adoption/retirement, pilot-script writer adoption, creation/submit
  initialization modeling, or all-writer completion in this slice.
- Do not start `T-002c` atomic fault-injection proof; it depends on the
  transition-command adoption shape and status/history/event commit scope.
- Do not start `T-002b` service/flight invariants; those depend on later
  service and VONESA/flight inputs.
- Do not start `T-008`, `T-009`, `T-010`, `T-011`, `T-108`, `T-109`, `T-114`,
  `T-301`, M1, M2, later architecture tasks, product-surface redesign, proxy,
  routes, auth, session, tenancy, schema, migrations, billing, Paddle/Stripe,
  README, AGENTS, or broad architecture docs.

## Verification Bar

- Focused proof: package domain-claims tests covering the admin transition
  writer success and rejection paths.
- Static guard proof: run the claim-status writer guard if the direct-writer
  allowlist or checked surface changes.
- Required local gates appropriate for changed files, including
  `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate` before merge
  readiness under Phase C rules.
- Scope proof: repo-scoped MCP `scope_audit` must confirm the implementation PR
  stays out of `apps/web/src/proxy.ts`, route/auth/session/tenancy/schema,
  billing/Paddle, README, AGENTS, broad architecture docs, and unrelated product
  surfaces.
- Repo-size proof: this promotion packet requires only a measured docs/text
  budget update. Measured tracked state is `3867` files, `31,025,810` bytes, and
  `4,466,044` docs/text bytes; budget limits are tightened to `3867` tracked
  files, `31,025,850` tracked bytes, and `4,466,100` docs/text bytes.
- Model review: not applicable for this Tier 0 docs-only closeout/promotion
  packet. The promoted implementation slice is not product-facing design work;
  if implementation evidence expands into Tier 3 architecture or reviewers
  disagree on the transition-command scope, request the required architecture
  review before PR readiness.
