---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/plans/2026-07-05-b2-staging-rbac-residual-check.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
---

# RBAC Fix Current-Authority Candidate

> Status: candidate input only. This document does not promote runtime work,
> edit source code, or replace `docs/plans/current-program.md` /
> `docs/plans/current-tracker.md`. Runtime work may start only after a merged
> current-authority/design-gate revision records the promoted slice and scope.

## Why This Candidate Exists

ENT-A01 reproduced the T-503 staging RBAC/role-marker residual on current
`main` staging:

- Evidence record:
  `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`
- Current main SHA tested: `2d0411a40620ad34170a0dc15556ea6db6e9d8ca`
- CD run: `https://github.com/interdomestik/interdomestik/actions/runs/28732941926`
- Passing first `e2e-staging` job: `85202744051`
- Failing same-day rerun job: `85207127377`
- Reproduced signature: `P0.1_RBAC_CANONICAL_MARKER_MISSING` for `/en/agent`
  and `/en/staff` after successful login.

This blocks non-dark launch/live-operationality claims and keeps `MOB-01b`
blocked. The next runtime candidate should fix the staging RBAC marker failure
before any public exposure slice.

## Proposed Slice ID

`RBAC-01` - restore staging canonical role-marker proof for `/agent` and
`/staff`.

Final ID may be renamed by the current-authority gate. The important decision is
the scope, not the label.

## Promotion Rationale

This candidate satisfies the active OBR selection rule because its primary
acceptance criterion directly improves tenant/privacy safety, auditability, and
release safety. It also removes a documented launch stop-condition.

## Proposed Scope

Allow the minimum runtime changes needed to make authenticated staging
navigations render the contractual canonical markers:

- agent login -> `/agent` and `/en/agent` exposes `agent-page-ready`;
- staff login -> `/staff` and `/en/staff` exposes `staff-page-ready`;
- member and admin controls remain green;
- P0.3 role-add flow remains green;
- the fix is proven on current-main staging with two consecutive same-day
  `e2e-staging` executions.

Permitted investigation may inspect routing, auth/session role resolution,
locale canonicalization, role-marker rendering, and release-gate test evidence.
If the marker path is proven to render and the failure is isolated to
release-gate session stabilization, the promoted slice may resolve through
narrow release-gate hardening instead of runtime code.

`apps/web/src/proxy.ts` remains read-only unless the authority record explicitly
names it as an allowed touch surface and explains why no narrower fix exists.

## Explicit Non-Scope

This slice must not implement or expose:

- `MOB-01b` non-dark Help Now / Trip Mode country pack;
- country content, L2 sign-off, pack hash changes, or launch flags;
- `MOB-05a`, `MOB-02`, `MOB-03`, or `MOB-05b`;
- billing/Paddle behavior;
- schema, RLS, or migrations unless a later gate replaces this candidate with a
  different explicitly authorized slice;
- member account creation, member surface redesign, or product UI polish;
- broad auth/routing/tenancy refactors;
- README, AGENTS, or broad architecture-doc rewrites.

## Required Gate Text If Promoted

The current-authority revision should state:

1. Resolver state before the gate is expected to be
   `blocked_requires_current_authority`, `activeSlice=null`.
2. The gate promotes exactly one runtime slice: `RBAC-01`.
3. `RBAC-01` exists only to close
   `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md`.
4. `MOB-01b` remains blocked until `RBAC-01` closes and ENT-A04/A05/A06 are
   complete.
5. Protected surfaces remain forbidden unless named in the gate as an allowed
   touch surface with a narrow reason.

## Acceptance Criteria

Implementation closeout must include:

- root-cause note explaining why `/en/agent` and `/en/staff` rendered not-found
  after successful login on staging;
- exact files changed and protected-surface statement;
- local focused proof for the changed role/route path;
- `pnpm pr:verify`;
- `pnpm security:guard`;
- `pnpm e2e:gate`;
- staging CD run URL for current main;
- two consecutive same-day successful `e2e-staging` job URLs after deployment;
- explicit confirmation that P0.1, P0.2, P0.3, P0.4, and P0.6 pass, or a
  documented reason if P0.6 is classified separately by the gate.

## Stop Conditions

Stop and return to authority if investigation shows the fix requires:

- a proxy/auth/session/tenancy redesign rather than a narrow correction;
- schema, RLS, or migration changes;
- changing canonical routes or marker contracts;
- weakening release-gate assertions;
- bypassing role checks in tests or runtime;
- changing Help Now launch posture as part of the fix.

## Recommended Sequence

1. Merge or approve a current-authority revision that promotes exactly
   `RBAC-01`.
2. Implement the narrow fix in a runtime branch.
3. Prove locally with focused tests and mandatory gates.
4. Merge the fix.
5. Re-run current-main staging `e2e-staging` twice.
6. Update `docs/plans/2026-07-05-b2-staging-rbac-residual-check.md` or add a
   closeout addendum with the two green URLs.
7. Only then resume the original enterprise sequence: KS reviewer/L2, B6, B7,
   and later `MOB-01b` gate.
