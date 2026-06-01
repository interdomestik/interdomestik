# ARCH-M0-05 Tenant Leak Guard Adoption Promotion

Status: complete
Slice: `ARCH-M0-05`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-01
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-04`.

## Closeout Basis

`ARCH-M0-04` landed in PR `#885` with merge commit `315339bc667673360c573f91be92ccb966ba67cc`, completing `T-004` by extracting the reusable `assertNoTenantLeak(rows, tenantId)` guard into the existing web server-domain ownership boundary, marking it `server-only`, wiring the original claim list read path through it, and adding focused same-tenant and cross-tenant unit proof.

## Promoted Slice

Promote `ARCH-M0-05 — Tenant Leak Guard Adoption`.

Tracker task: `T-005`.

Goal: apply the reusable `assertNoTenantLeak(rows, tenantId)` guard to every applicable list query in the existing `server/domains/*` ownership boundary so tenant-scoped list reads share one tested assertion path.

## Scope

- Inventory current list queries under `server/domains/*`.
- Apply `assertNoTenantLeak(rows, tenantId)` only to list-query paths that return tenant-scoped rows.
- Add static proof that applicable list queries do not return tenant-scoped rows without the guard.
- Add focused two-tenant overlapping-id fuzz or unit proof.

## Out Of Scope

- Do not start `T-006`, `T-006b`, `T-007`, `T-007b`, `T-008`, `T-009`, `T-010`, `T-011`, M1, or any product-surface slice.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session architecture, tenancy architecture, schemas, migrations, billing, Stripe/Paddle posture, README, AGENTS, or broad architecture docs.
- Do not broaden this slice beyond existing server-domain list-query guard adoption.

## Verification Bar

- Focused adoption tests or static inventory proof first.
- Relevant package/domain type-check or unit tests.
- `pnpm security:guard`.
- `pnpm pr:verify`.
- `pnpm e2e:gate` only if implementation touches a web flow or gate surface; otherwise record why it is not relevant.
