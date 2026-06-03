---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-03
tracker_id: T-002
---

# ARCH-M0-17 Admin Ops Transition Writer Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M0-17`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-03
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-16`.

## Closeout Basis

`ARCH-M0-16` landed in PR `#916` with squash merge commit
`21e0eebb17ff96e540c46dba34c44e27dd721c92`, completing the member draft
cancellation writer adoption by routing `cancelClaimCore` through
`transitionClaimStatus()`.

The merged slice preserved the member cancellation API `ActionResult` shape,
existing error strings, tenant and member scoping, authorization behavior, actor
context, lifecycle-version behavior, history writes, audit metadata,
revalidation behavior, and transition rejection behavior.

The merged slice also removed the draft cancellation path from the direct writer
guard allowlist. Phase C routing and architecture boundaries remained intact:
`apps/web/src/proxy.ts` stayed read-only, canonical routes stayed `/member`,
`/agent`, `/staff`, and `/admin`, and no auth/session/tenancy/schema/billing
work was started.

## Promoted Slice

Promote `ARCH-M0-17 -- Admin Ops Transition Writer Adoption`.

Tracker task: `T-002`.

Goal: route the app-local admin ops claim-status writer in
`apps/web/src/features/admin/claims/actions/ops-actions.ts` / `updateStatus`
through the existing `transitionClaimStatus()` command as the next bounded
`T-002` adoption step.

## Current Evidence

- `T-002` remains the active M0 task requiring runtime writers from the `T-000`
  inventory to use the sole transactional `transitionClaimStatus()` command.
- `ARCH-M0-03` routed the staff package writer through the transition command.
- `ARCH-M0-12` routed the package admin writer through the transition command.
- `ARCH-M0-13` routed the package agent writer through the transition command.
- `ARCH-M0-14` routed the package generic writer through the transition command.
- `ARCH-M0-15` routed the package legacy helper through the transition command.
- `ARCH-M0-16` routed the member draft cancellation writer through the
  transition command.
- `docs/plans/2026-05-31-arch-m0-01-writer-inventory.md` identifies
  `apps/web/src/features/admin/claims/actions/ops-actions.ts` / `updateStatus`
  as an app-local admin ops direct writer that must route through
  `transitionClaimStatus()` in `T-002` or be retired behind a package action.
- The claim-status writer guard currently reports 15 direct writers after
  draft cancellation adoption. The app-local admin ops writer remains the next
  non-fixture runtime writer in that inventory.

## Scope

- Inspect the app-local admin ops status action, callers, focused tests, prior
  package admin/staff/agent/generic/legacy/draft adoption patterns, transition
  command foundation, writer guard, action helpers, audit metadata, revalidation
  behavior, and transition rejection behavior before changing runtime code.
- Route only
  `apps/web/src/features/admin/claims/actions/ops-actions.ts` / `updateStatus`
  through `transitionClaimStatus()`, or retire the local status writer only if
  implementation proves the app surface can safely delegate to an existing
  package action without changing behavior.
- Preserve app-local admin ops API behavior, `OpsActionResponse` shape,
  existing error strings where applicable, tenant scoping, admin/staff access
  checks, assigned-owner status-change rule, actor context, lifecycle-version
  behavior, history write behavior, audit metadata, revalidation behavior, and
  transition rejection behavior.
- Add focused tests proving admin ops success and rejection behavior through the
  transition command.
- Tighten or update the claim-status writer guard only if the implementation
  requires a narrow, explicit policy change.

## Out Of Scope

- Do not start creation/submit initialization modeling.
- Do not start pilot-script writer adoption, seed/test writer policy changes,
  or all-writer completion.
- Do not start `T-002c` atomic fault-injection proof; it depends on the
  transition-command adoption shape and status/history/event commit scope.
- Do not start `T-002b` service/flight invariants; those depend on later service
  and VONESA/flight inputs.
- Do not start `T-108`, `T-109`, `T-114`, `T-301`, M1, M2, later architecture
  tasks, product-surface redesign, proxy, routes, auth, session, tenancy,
  schema, migrations, billing, Paddle/Stripe, README, AGENTS, or broad
  architecture docs.

## Verification Bar

- Focused proof: app/admin ops action tests covering status-change success and
  rejection paths through `transitionClaimStatus()`.
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
