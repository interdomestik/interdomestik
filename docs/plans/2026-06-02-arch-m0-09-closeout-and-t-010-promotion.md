# ARCH-M0-09 Closeout And T-010 Promotion

Status: complete
Slice: `ARCH-M0-09`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-02
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-09`.

## Closeout Basis

`ARCH-M0-09` landed in PR `#899` with squash merge commit
`37e8a3b64d093ce9f968c8aba5b04163e6e4b05e`, completing `T-009` by
converting `packages/domain-claims/src/claims/status.ts` from stringly
`{ error: 'string' }` returns to the package `ActionResult` discriminated
contract.

The merged slice preserved existing error strings and success behavior, updated
focused tests, and proved that no legacy `return { error:` remains in the
converted claim-status path.

## Promoted Slice

Promote `ARCH-M0-10 -- ADR Claim Transition And Role-Separation Records`.

Tracker task: `T-010`.

Goal: author the architecture decision records required by M0 before advancing
to the remaining transition-writer and host-tenant guard work:

- ADR-04 documents `canTransition(...)` and `transitionClaimStatus()` as the
  sole claim-status transition authority.
- ADR-09 records the role-separation direction as a stub for later
  separation-of-duties and break-glass governance work.

## Scope

- Inspect existing ADR or architecture-decision conventions before writing.
- Add the smallest repo-native ADR records required for `T-010`.
- Keep ADR-04 grounded in the already-merged `T-001`/`T-001b` transition
  foundation and the active `T-002` sole-writer migration direction.
- Keep ADR-09 as a stub only; do not implement new roles, permission changes,
  operational RACI, or break-glass mechanics in this slice.
- Keep ADR-09 aligned with the Rev 6 separation-of-duties direction while
  deferring detailed governance and break-glass implementation to later
  `T-301`-level work.
- Update repo-canonical tracker/program state only as needed for this promoted
  slice.

## Out Of Scope

- Do not start `T-002b`, `T-002c`, `T-011`, `T-301`, M1, or any product-surface
  slice.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session
  architecture, tenancy architecture, schemas, migrations, billing,
  Paddle/Stripe posture, README, AGENTS, or broad architecture docs.
- Do not migrate additional status writers, extend `canTransition` with
  service/flight invariants, add `global_support` or `auditor`, change role
  permissions, or build governance/break-glass runtime behavior.

## Verification Bar

- ADR/docs-focused proof: `git diff --check`, `pnpm plan:status`,
  `pnpm plan:audit`, `pnpm track:audit`, and `pnpm docs:verify`.
- Repo-size proof: budget movement is limited to `maxTrackedFiles` `3861` ->
  `3862` and `maxTrackedBytes` `31000000` -> `31001000` for this newly
  tracked closeout/promotion packet; category budgets are unchanged.
- `pnpm ci:local:quick` before PR readiness unless the local parity container
  is blocked by an unrelated environment issue, in which case record the exact
  blocker.
