---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-02
tracker_id: T-002
---

# ARCH-M0-14 Claims Status Writer Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M0-14`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-02
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-13`.

## Closeout Basis

`ARCH-M0-13` landed in PR `#908` with squash merge commit
`f7f0177148ef279d9f86d36680ff17fc99c5d0d4`, completing the package agent
claim-status writer adoption by routing
`packages/domain-claims/src/agent-claims/update-status.ts` through
`transitionClaimStatus()`.

The merged slice preserved the package agent API behavior, `ActionResult` shape,
tenant scoping, staff/admin access checks, actor context, lifecycle-version
behavior, history writes, audit metadata, notification behavior, and transition
rejection behavior. Focused tests prove agent success, rejection mapping,
absence of direct `db.update`, and payment-authorization forwarding for gated
statuses.

The merged slice also removed the package agent writer from the direct writer
guard allowlist. Phase C routing and architecture boundaries remained intact:
`apps/web/src/proxy.ts` stayed read-only, canonical routes stayed `/member`,
`/agent`, `/staff`, and `/admin`, and no auth/session/tenancy/schema/billing
work was started.

## Promoted Slice

Promote `ARCH-M0-14 -- Package Claim Status Transition Writer Adoption`.

Tracker task: `T-002`.

Goal: route the package generic claim-status writer in
`packages/domain-claims/src/claims/status.ts` through the existing
`transitionClaimStatus()` command as the next bounded `T-002` adoption step.

## Current Evidence

- `T-002` remains the active M0 task requiring runtime writers from the `T-000`
  inventory to use the sole transactional `transitionClaimStatus()` command.
- `ARCH-M0-03` routed the staff package writer through the transition command.
- `ARCH-M0-12` routed the package admin writer through the transition command.
- `ARCH-M0-13` routed the package agent writer through the transition command.
- `ARCH-M0-09` converted `packages/domain-claims/src/claims/status.ts` to the
  package `ActionResult` discriminated contract, preserving existing error
  strings and success behavior before broader writer adoption.
- `docs/plans/2026-05-31-arch-m0-01-writer-inventory.md` identifies
  `packages/domain-claims/src/claims/status.ts` / `updateClaimStatusCore` as a
  legacy direct writer that must route through `transitionClaimStatus()` in
  `T-002`.

## Scope

- Inspect the existing package generic claim-status writer, transition command,
  staff/admin/agent adoption patterns, writer guard, audit behavior, and focused
  tests before changing runtime code.
- Route only `packages/domain-claims/src/claims/status.ts` through
  `transitionClaimStatus()`.
- Preserve the package API behavior, `ActionResult` shape from `ARCH-M0-09`,
  existing error strings where applicable, tenant/member scoping, authorization
  behavior, actor context, lifecycle-version behavior, history write behavior,
  audit metadata, and transition rejection behavior.
- Add focused tests proving success and rejection behavior through the
  transition command.
- Tighten or update the claim-status writer guard only if the implementation
  requires a narrow, explicit policy change.

## Out Of Scope

- Do not start the app-local admin ops writer in
  `apps/web/src/features/admin/claims/actions/ops-actions.ts`.
- Do not start draft cancellation adoption, legacy helper adoption/retirement,
  pilot-script writer adoption, creation/submit initialization modeling, or
  all-writer completion.
- Do not start `T-002c` atomic fault-injection proof; it depends on the
  transition-command adoption shape and status/history/event commit scope.
- Do not start `T-002b` service/flight invariants; those depend on later service
  and VONESA/flight inputs.
- Do not start `T-108`, `T-109`, `T-114`, `T-301`, M1, M2, later architecture
  tasks, product-surface redesign, proxy, routes, auth, session, tenancy,
  schema, migrations, billing, Paddle/Stripe, README, AGENTS, or broad
  architecture docs.

## Verification Bar

- Focused proof: package domain-claims tests covering generic claim-status
  writer success and rejection paths through `transitionClaimStatus()`.
- Static guard proof: run the claim-status writer guard if the direct-writer
  allowlist or checked surface changes.
- Required local gates appropriate for changed files, including
  `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate` before merge
  readiness under Phase C rules.
- Scope proof: repo-scoped MCP `scope_audit` must confirm the implementation PR
  stays out of `apps/web/src/proxy.ts`, route/auth/session/tenancy/schema,
  billing/Paddle, README, AGENTS, broad architecture docs, and unrelated
  product surfaces.
- Repo-size proof: this promotion packet requires only a measured docs/text
  budget update if the existing budget is exceeded.
- Model review: not applicable for this Tier 0 docs-only closeout/promotion
  packet. The promoted implementation slice is not product-facing design work;
  if implementation evidence expands into Tier 3 architecture or reviewers
  disagree on the transition-command scope, request the required architecture
  review before PR readiness.
