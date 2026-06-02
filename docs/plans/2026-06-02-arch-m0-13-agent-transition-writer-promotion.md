---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-02
tracker_id: T-002
---

# ARCH-M0-13 Agent Transition Writer Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M0-13`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-02
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-12`.

## Closeout Basis

`ARCH-M0-12` landed in PR `#905` with merge commit
`beded00bffd862198fede0b460856b6facc41bb4`, completing the package admin
claim-status writer adoption by routing
`packages/domain-claims/src/admin-claims/update-status.ts` through
`transitionClaimStatus()`.

PR `#906` landed the SonarCloud duplicated-lines follow-up with merge commit
`06bf9f565d936373a7c1fd56f24dbfe9375afae6`, extracting shared admin
claim-status test support without changing runtime behavior.

The merged slices preserve Phase C routing and architecture boundaries:
`apps/web/src/proxy.ts` stayed read-only, canonical routes stayed `/member`,
`/agent`, `/staff`, and `/admin`, no auth/session/tenancy/schema/billing work
was started, and `T-002` remains WIP rather than complete.

## Promoted Slice

Promote `ARCH-M0-13 -- Agent Claim Status Transition Writer Adoption`.

Tracker task: `T-002`.

Goal: route the package agent claim-status writer through the existing
`transitionClaimStatus()` command as the next bounded `T-002` adoption step.

## Current Evidence

- `T-002` remains the active M0 task requiring runtime writers from the `T-000`
  inventory to use the sole transactional `transitionClaimStatus()` command.
- `ARCH-M0-03` routed the staff package writer through the transition command.
- `ARCH-M0-12` routed the package admin writer through the transition command.
- `ARCH-M0-09` converted the package claim-status action result surface to the
  package `ActionResult` contract before broader writer adoption.
- `ARCH-M0-10` recorded ADR-04, which names `canTransition(...)` and
  `transitionClaimStatus()` as the sole claim-status transition architecture.
- `docs/plans/2026-05-31-arch-m0-01-writer-inventory.md` identifies
  `packages/domain-claims/src/agent-claims/update-status.ts` /
  `updateClaimStatusCore` as a direct package writer that must route through
  `transitionClaimStatus()` in `T-002`.

## Scope

- Inspect the existing agent writer, transition command, staff/admin adoption
  patterns, writer guard, and focused domain tests before changing runtime
  code.
- Route only `packages/domain-claims/src/agent-claims/update-status.ts`
  through `transitionClaimStatus()`.
- Preserve the package agent API behavior, `ActionResult` shape, existing error
  strings where applicable, tenant scoping, staff/admin access checks, actor
  context, lifecycle-version behavior, history write behavior, audit metadata,
  notification behavior, and transition rejection behavior.
- Add focused tests proving agent-writer success and rejection behavior through
  the transition command.
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

- Focused proof: package domain-claims tests covering the agent transition
  writer success and rejection paths.
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
  budget update. Measured tracked state is `3871` files, `31,039,509` bytes,
  and `4,471,381` docs/text bytes; budget limits are tightened to those exact
  values.
- Model review: not applicable for this Tier 0 docs-only closeout/promotion
  packet. The promoted implementation slice is not product-facing design work;
  if implementation evidence expands into Tier 3 architecture or reviewers
  disagree on the transition-command scope, request the required architecture
  review before PR readiness.
