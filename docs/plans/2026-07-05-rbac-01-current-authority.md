---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
tracker_path: docs/plans/current-tracker.md
related:
  - docs/plans/2026-07-05-b2-staging-rbac-residual-check.md
  - docs/plans/2026-07-05-rbac-fix-current-authority-candidate.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
---

# RBAC-01 Current Authority

> Status: Tier 0 current-authority/design-gate record. This document supports
> `current-program.md` and `current-tracker.md`; it is not a source of truth by
> itself and does not implement runtime, product UI, schema, RLS, migration,
> auth, session, tenancy, routing, proxy, billing, dependency, README, AGENTS,
> or broad architecture work.

## Classification

This is promotion/design-gate work. It records the next single governed
implementation slice after ENT-A01 reproduced the staging RBAC residual. It does
not change source code or runtime behavior.

## Day-Of-Use Authority State

Prepared from `main@2d0411a40620ad34170a0dc15556ea6db6e9d8ca` on 2026-07-05.

The fresh current-authority resolver returned:

- `status=blocked_requires_current_authority`
- `reason=umbrella_without_concrete_promoted_slice`
- `activeSlice=null`
- `sourceFile=docs/plans/current-tracker.md`

That is the expected post-`MOB-01` state. `MOB-01` consumed `MOB-DG01`; no
replacement runtime slice was promoted by its closeout.

## Inputs

- `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`
- `docs/plans/2026-07-05-rbac-fix-current-authority-candidate.md`
- `docs/plans/2026-07-03-t503-drop-claim-status-closeout.md`
- `docs/plans/2026-07-04-mob-dg01-help-now-trip-mode-current-authority.md`
- `docs/reviews/2026-07-05-enterprise-transformation-register.md`
- `docs/reviews/2026-07-05-week1-execution-packet.md`

Obsidian notes remain advisory only. Repository source, current-program,
current-tracker, tests, gates, and explicit user instructions remain
authoritative.

## Decision

Promote exactly one canonical tracker slice: `RBAC-01`.

The next active governed implementation goal is exactly one canonical tracker
slice: `RBAC-01`.

No MOB slice is promoted by this gate.

## Scope

Future `RBAC-01` is limited to closing the reproduced staging RBAC role-marker
residual recorded in
`docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`.

The implementation may investigate and fix the minimum path required for:

- agent login -> `/agent` and `/en/agent` exposing the contractual agent
  clarity marker;
- staff login -> `/staff` and `/en/staff` exposing the contractual staff
  clarity marker;
- member and admin controls remaining green;
- P0.3 role-add flow remaining green;
- current-main staging proving two consecutive same-day successful
  `e2e-staging` executions after deployment.

Permitted investigation surfaces are role resolution, authenticated route
navigation, locale canonicalization, role-marker rendering, and release-gate
evidence for the failing path.

If investigation proves the route itself can render the contractual marker and
the failure is a release-gate stabilization race, RBAC-01 may close through a
narrow release-gate hardening change. That hardening must still require the same
canonical markers and must not skip, remove, or loosen RBAC assertions.

## Binding Constraints

`apps/web/src/proxy.ts` remains read-only unless the implementation branch
first proves no narrower fix exists and returns for explicit authority before
touching it.

`RBAC-01` must not change canonical routes, marker contracts, country-content
launch posture, L2 content sign-off, pack hashes, public launch flags,
member-account creation, billing/Paddle, schema/RLS/migrations, claim-transition
writers, Operational Brain runtime, README, AGENTS, or broad architecture docs.

`RBAC-01` must not weaken, skip, or narrow the staging release-gate assertions to
make the failure disappear. The acceptance path is to make the contractual role
flows pass.

## MOB-01b Boundary

`MOB-01b` remains blocked. It may not start until:

- `RBAC-01` closes ENT-A01 with two same-day green `e2e-staging` runs;
- ENT-A04 L2 KS content sign-off is complete;
- ENT-A05 B6 content-pack hotfix runbook is exercised;
- ENT-A06 B7 `/help-now` alert coverage is proven;
- a later current-authority/design-gate promotes exactly `MOB-01b`.

## Acceptance Evidence For RBAC-01

Implementation closeout must record:

- root cause of `/en/agent` and `/en/staff` rendering not-found after successful
  login on staging;
- exact files changed and protected-surface statement;
- focused local proof for the changed role/route path;
- `pnpm pr:verify`;
- `pnpm security:guard`;
- `pnpm e2e:gate`;
- current-main staging CD run URL;
- two consecutive same-day successful `e2e-staging` job URLs after deployment;
- explicit P0 status summary covering P0.1, P0.2, P0.3, P0.4, and P0.6.

## Stop Conditions

Stop and return to authority if the fix requires:

- editing `apps/web/src/proxy.ts`;
- a broad auth/session/tenancy/routing redesign;
- schema, RLS, or migration changes;
- changing canonical routes or marker contracts;
- weakening release-gate assertions;
- changing Help Now launch posture.

## Gate Proof

Tier 0 proof required for this gate:

- `git diff --check`
- `pnpm docs:verify`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`

After this gate text is applied, `next-slice.mjs` is expected to return
`status=ready` and `activeSlice.id=RBAC-01`.
