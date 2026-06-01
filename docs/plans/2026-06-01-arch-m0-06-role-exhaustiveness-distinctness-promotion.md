# ARCH-M0-06 Role Exhaustiveness And Distinctness Promotion

Status: complete
Slice: `ARCH-M0-06`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-01
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-05`.

## Closeout Basis

`ARCH-M0-05` landed in PR `#887` with merge commit `7a7fe14be9d4afa5c759068184d3e62c5c6e4946`, completing `T-005` by adopting the reusable tenant leak guard on the applicable claims list path, preserving the session-derived expected tenant, and adding static plus overlapping-id two-tenant proof.

## Promoted Slice

Promote `ARCH-M0-06 — Role Exhaustiveness And Distinctness`.

Tracker task: `T-006`.

Goal: add focused role-permission proof so shared-auth role coverage and admin-role distinctness become explicit guardrails before later role de-collapse work.

## Scope

- Add focused proof that `ROLE_PERMISSIONS` is defined for every `ROLES.*` value.
- Add focused proof that `admin` and `tenant_admin` are not permission-identical to `super_admin`.
- Keep required gates green; if the current role model cannot satisfy the proof without broader de-collapse, stop with a bounded finding instead of starting `T-301`.

## Out Of Scope

- Do not start `T-006b`, `T-007`, `T-007b`, `T-008`, `T-009`, `T-010`, `T-011`, `T-301`, M1, or any product-surface slice.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session architecture, tenancy architecture, schemas, migrations, billing, Stripe/Paddle posture, README, AGENTS, or broad architecture docs.
- Do not add raw-role-array lint, global support/auditor roles, or broad permission de-collapse in this slice.

## Verification Bar

- Focused shared-auth role/permission proof first.
- Relevant package type-check or unit tests.
- `pnpm security:guard`.
- `pnpm pr:verify`.
- `pnpm e2e:gate` only if implementation touches a web flow or gate surface; otherwise record why it is not relevant.
