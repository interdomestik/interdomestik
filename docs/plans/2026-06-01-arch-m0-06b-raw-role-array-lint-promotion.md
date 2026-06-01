# ARCH-M0-06b Raw Role Array Lint Promotion

Status: complete
Slice: `ARCH-M0-06b`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-01
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-06`.

## Closeout Basis

`ARCH-M0-06` landed in PR `#889` with merge commit
`440d914c811a4eca91ccd94e456fb1e09da45f63`, completing `T-006` by exporting
the shared-auth role permission matrix and proving role coverage, declared permissions,
immutable exported arrays, and `admin`/`tenant_admin` distinctness from `super_admin`.

## Promoted Slice

Promote `ARCH-M0-06b — Raw Role Array Lint`.

Tracker task: `T-006b`.

Goal: add a focused CI guard that blocks new inline/raw role arrays outside shared authz
helpers so later role de-collapse cannot be bypassed by scattered local role checks.

## Scope

- Add a repo-owned lint/check for raw role arrays outside the approved shared authz helper
  boundary.
- Add seeded proof that the check fails for an inline role array such as `['admin', 'staff']`.
- Preserve or document approved helper/test exceptions narrowly.
- Wire the check into the existing required verification surface without starting role
  de-collapse.

## Out Of Scope

- Do not start `T-301`, `T-007`, `T-007b`, `T-008`, `T-009`, `T-010`, `T-011`, M1, or any product-surface slice.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session architecture, tenancy architecture, schemas, migrations, billing, Stripe/Paddle posture, README, AGENTS, or broad architecture docs.
- Do not add `global_support`/`auditor` roles, rewrite permission semantics, or perform broad role de-collapse in this slice.

## Verification Bar

- Focused lint/check unit proof for allowed and rejected role-array patterns.
- The check wired into the relevant required guard lane.
- `pnpm security:guard`.
- `pnpm pr:verify`.
- `pnpm e2e:gate` only if implementation touches a web flow or gate surface; otherwise record why it is not relevant.
