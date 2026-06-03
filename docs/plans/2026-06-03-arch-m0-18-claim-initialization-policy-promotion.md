---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-03
tracker_id: T-002
---

# ARCH-M0-18 Claim Initialization Policy Promotion

> Status: active input; Tier 0 closeout and promotion packet only.

Status: promoted
Slice: `ARCH-M0-18`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-03
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-17`.

## Closeout Basis

`ARCH-M0-17` landed in PR `#918` with squash merge commit
`2a3b43a0beac4ffc3c33478833bca2996f54bce8`, completing the app-local admin ops
status-writer adoption by routing
`apps/web/src/features/admin/claims/actions/ops-actions.ts` / `updateStatus`
through the domain transition runtime.

The merged slice preserved the app-local admin ops `OpsActionResponse` shape,
tenant scoping, admin session boundary, transition validation, assigned-owner
status-change rule, actor context, lifecycle-version behavior, transactional
history write behavior, audit metadata, and revalidation behavior.

The merged slice also removed the app-local admin ops path from the direct writer
guard allowlist. The guard now reports 14 inventoried writers: the transition
command, the already-adopted staff wrapper path, claim creation/submit
initialization paths, seed/test fixtures, and pilot-script fixtures. Phase C
routing and architecture boundaries remained intact: `apps/web/src/proxy.ts`
stayed read-only, canonical routes stayed `/member`, `/agent`, `/staff`, and
`/admin`, and no auth/session/tenancy/schema/billing work was started.

## Promoted Slice

Promote `ARCH-M0-18 -- Claim Creation/Submit Initialization Policy And Guard`.

Tracker task: `T-002`.

Goal: classify and guard the remaining package claim creation/submit
initialization paths in `packages/domain-claims/src/claims/create.ts` and
`packages/domain-claims/src/claims/submit.ts` so `T-002` can distinguish initial
aggregate status creation from post-create claim-status transitions.

## Current Evidence

- `T-002` remains the active M0 task requiring post-create claim-status
  transitions from the `T-000` inventory to use the sole transactional
  `transitionClaimStatus()` command.
- `ARCH-M0-03`, `ARCH-M0-12`, `ARCH-M0-13`, `ARCH-M0-14`, `ARCH-M0-15`,
  `ARCH-M0-16`, and `ARCH-M0-17` have routed the runtime transition writers
  through the transition command.
- The remaining package runtime entries from the T-000 inventory are
  `createClaimCore` and `persistSubmittedClaim`, which insert new aggregate
  rows with initial statuses rather than updating an existing claim status.
- The writer guard still has one broad allowlist. It should now make the
  creation-initialization exception explicit instead of leaving it blended with
  transition writers and fixtures.

## Scope

- Inspect `createClaimCore`, `persistSubmittedClaim`, their focused tests, the
  writer inventory, the claim-status writer guard, and the existing transition
  command before changing runtime or guard policy.
- Add the smallest guard/test change needed to make creation/submit
  initialization explicit and stable. The preferred shape is a named
  initialization allowlist or equivalent classification that keeps post-create
  status updates legal only through `transitionClaimStatus()`.
- Preserve claim creation and submission behavior, existing public/package API
  shapes, tenant/member scoping, existing initial status values, claim-pack
  creation, evidence handling, audit/notification behavior, and current tests.
- Keep `createClaimCore` and `persistSubmittedClaim` as creation initialization
  paths unless implementation evidence proves they perform post-create
  transitions that must route through `transitionClaimStatus()`.

## Out Of Scope

- Do not start seed/test fixture factory redesign.
- Do not start pilot-script writer adoption or retirement.
- Do not declare `T-002` complete unless the implementation proves all
  remaining inventory classes are either transitioned, initialization-only, or
  explicitly fixture-only under the guard.
- Do not start `T-002c` atomic fault-injection proof; it depends on the final
  transition-command and initialization policy shape.
- Do not start `T-002b` service/flight invariants; those depend on later service
  and VONESA/flight inputs.
- Do not start `T-108`, `T-109`, `T-114`, `T-301`, M1, M2, later architecture
  tasks, product-surface redesign, proxy, routes, auth, session, tenancy,
  schema, migrations, billing, Paddle/Stripe, README, AGENTS, or broad
  architecture docs.

## Verification Bar

- Focused proof: claim-status writer guard tests proving creation/submit
  initialization is explicitly classified and unexpected post-create status
  writers still fail.
- Runtime proof: focused create/submit tests only if implementation touches
  those package paths.
- Required local gates appropriate for changed files, including
  `pnpm security:guard`, `pnpm pr:verify`, and `pnpm e2e:gate` before merge
  readiness under Phase C rules.
- Scope proof: repo-scoped MCP `scope_audit` must confirm the implementation PR
  stays out of `apps/web/src/proxy.ts`, route/auth/session/tenancy/schema,
  billing/Paddle, README, AGENTS, broad architecture docs, and unrelated
  product surfaces.
- Repo-size proof: this promotion packet requires only a measured docs/text
  budget update if the existing budget is exceeded.

## Model Review Disposition

- Sonnet: not applicable for this Tier 0 docs-only closeout/promotion packet.
  The promoted implementation slice is a runtime-contract guard step and must
  run Sonnet 4.6 architecture/scope review before PR readiness if it changes
  runtime behavior or if reviewers disagree on the initialization boundary.
- Gemini: not applicable because this packet and the promoted implementation
  target no product, UX, mobile, accessibility, or copy behavior.
- Copilot/Sonar/reviewer comments: monitored for PR `#918`; SonarCloud reported
  0 new issues and 0 security hotspots after the follow-up transaction typing
  fix, and no Copilot or review threads required action.
