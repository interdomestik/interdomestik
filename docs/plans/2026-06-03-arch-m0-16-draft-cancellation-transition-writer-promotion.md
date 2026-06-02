---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-03
tracker_id: T-002
---

# ARCH-M0-16 Draft Cancellation Transition Writer Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M0-16`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-03
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-15`.

## Closeout Basis

`ARCH-M0-15` landed in PR `#912` with squash merge commit
`99b8c09500ecdea101d5d9bb1f85e59c0d5bc74f`, completing the package legacy
claim-status helper adoption by routing
`packages/domain-claims/src/update-claim-status.ts` through
`transitionClaimStatusInTransaction()`.

The merged slice preserved the package staff-only API `ActionResult` shape,
existing error strings, tenant scoping, branch and assigned-staff access
checks, actor context, lifecycle-version behavior, history writes, audit
metadata, notification behavior, same-status no-note no-op behavior, and
transition rejection behavior.

The merged slice also removed the package legacy helper from the direct writer
guard allowlist. Phase C routing and architecture boundaries remained intact:
`apps/web/src/proxy.ts` stayed read-only, canonical routes stayed `/member`,
`/agent`, `/staff`, and `/admin`, and no auth/session/tenancy/schema/billing
work was started.

## Promoted Slice

Promote `ARCH-M0-16 -- Draft Cancellation Transition Writer Adoption`.

Tracker task: `T-002`.

Goal: route the member draft cancellation writer in
`packages/domain-claims/src/claims/draft.ts` / `cancelClaimCore` through the
existing `transitionClaimStatus()` command as the next bounded `T-002` adoption
step.

## Current Evidence

- `T-002` remains the active M0 task requiring runtime writers from the `T-000`
  inventory to use the sole transactional `transitionClaimStatus()` command.
- `ARCH-M0-03` routed the staff package writer through the transition command.
- `ARCH-M0-12` routed the package admin writer through the transition command.
- `ARCH-M0-13` routed the package agent writer through the transition command.
- `ARCH-M0-14` routed the package generic writer through the transition command.
- `ARCH-M0-15` routed the package legacy helper through the transition command.
- `docs/plans/2026-05-31-arch-m0-01-writer-inventory.md` identifies
  `packages/domain-claims/src/claims/draft.ts` / `cancelClaimCore` as a member
  cancellation direct writer that must route through `transitionClaimStatus()`
  in `T-002`.

## Scope

- Inspect the draft cancellation writer, callers, focused tests, prior
  staff/admin/agent/generic/legacy-helper adoption patterns, transition command
  foundation, writer guard, audit metadata, history behavior, and notification
  behavior before changing runtime code.
- Route only `packages/domain-claims/src/claims/draft.ts` / `cancelClaimCore`
  through `transitionClaimStatus()`.
- Preserve exported package API behavior, `ActionResult` shape, existing error
  strings where applicable, tenant and member scoping, authorization behavior,
  actor context, lifecycle-version behavior, history write behavior, audit
  metadata, notification behavior, and transition rejection behavior.
- Add focused tests proving draft-cancellation success and rejection behavior
  through the transition command.
- Tighten or update the claim-status writer guard only if the implementation
  requires a narrow, explicit policy change.

## Out Of Scope

- Do not start the app-local admin ops writer in
  `apps/web/src/features/admin/claims/actions/ops-actions.ts`.
- Do not start pilot-script writer adoption, creation/submit initialization
  modeling, or all-writer completion.
- Do not start `T-002c` atomic fault-injection proof; it depends on the
  transition-command adoption shape and status/history/event commit scope.
- Do not start `T-002b` service/flight invariants; those depend on later service
  and VONESA/flight inputs.
- Do not start `T-108`, `T-109`, `T-114`, `T-301`, M1, M2, later architecture
  tasks, product-surface redesign, proxy, routes, auth, session, tenancy,
  schema, migrations, billing, Paddle/Stripe, README, AGENTS, or broad
  architecture docs.

## Verification Bar

- Focused proof: package domain-claims tests covering draft cancellation success
  and rejection paths through `transitionClaimStatus()`.
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
