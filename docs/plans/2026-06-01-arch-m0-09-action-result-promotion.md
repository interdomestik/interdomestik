# ARCH-M0-09 ActionResult Claim Status Cleanup Promotion

Status: complete
Slice: `ARCH-M0-09`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-01
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-08`.

## Closeout Basis

`ARCH-M0-08` landed in PR `#897` with merge commit
`da62ab6dfa714c7624aee36109006f7f69f38816`, completing `T-008` by adding
`compensation guaranteed` to the existing compensation-promise framing policy and proving
seeded detection in both locale/message copy and the explicit thank-you email template
surface.

## Promoted Slice

Promote `ARCH-M0-09 -- ActionResult Claim Status Cleanup`.

Tracker task: `T-009`.

Goal: convert the claim-status path in `packages/domain-claims/src/claims/status.ts`
away from stringly `{ error: 'string' }` returns and onto a discriminated
`ActionResult<T>` contract that type-checks callers and keeps failure handling explicit.

## Scope

- Inspect the existing claim-status path, current result shapes, and direct callers before
  changing types.
- Confirm the exact `packages/domain-claims/src/claims/status.ts` entry point and any
  route/action wrappers before editing so the slice does not drift into sibling status
  writers.
- Reuse any existing repo `ActionResult` or discriminated result pattern if present.
- If no repo-canonical `ActionResult<T>` exists, define the claim-status result type at
  the nearest package boundary, not inline in `status.ts`.
- Convert only the `packages/domain-claims/src/claims/status.ts` claim-status path needed
  for `T-009`.
- Keep caller behavior stable while making success and failure states explicit in types.
- Add focused type or runtime proof that stringly `{ error: 'string' }` returns no longer
  exist on the converted path.

## Out Of Scope

- Do not start `T-002b`, `T-002c`, `T-010`, `T-011`, M1, or any unrelated product-surface
  slice.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session architecture,
  tenancy architecture, schemas, migrations, billing, Paddle/Stripe posture, README,
  AGENTS, or broad architecture docs.
- Do not migrate all status writers, add service/flight invariants, author ADRs, redesign
  claim status UX, or broaden error-shape cleanup beyond the `T-009` path.
- Do not alter `T-001`/`T-001b` transition lifecycle machinery, including `canTransition`,
  except for type adaptation strictly required by the converted
  `packages/domain-claims/src/claims/status.ts` caller boundary.

## Verification Bar

- Focused unit/type proof for the converted claim-status result contract.
- Static proof that the converted path no longer returns stringly `{ error: 'string' }`.
- `pnpm security:guard`.
- `pnpm pr:verify`.
- `pnpm e2e:gate`.
