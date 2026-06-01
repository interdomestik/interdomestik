# ARCH-M0-04 Tenant Leak Harness Promotion

Status: complete
Slice: `ARCH-M0-04`
Owner: platform + architecture + qa
Phase: Phase C
Date: 2026-06-01
Authority: promotion-only closeout and next-slice selection after `ARCH-M0-03`.

## Closeout Basis

`ARCH-M0-01` landed in PR `#880` with merge commit `d3783f424a35acdd5b6b29d10010a9c2883872b4`, completing `T-000` writer inventory and the claim-status writer guard.

`ARCH-M0-02` landed in PR `#881` with merge commit `2f16d2455503d98c7cba2acc55576851569a0e32`, completing `T-001` and `T-001b` by adding the pure transition guard, lifecycle version foundation, transactional transition command, optimistic lifecycle update, history insert, and focused transition proof.

`ARCH-M0-03` landed in PR `#883` with merge commit `7e10e5249d98ad342459d283bbaa8229e3fee78a`, completing `T-003` and the first bounded staff-writer adoption step of `T-002`.

## Promoted Slice

Promote `ARCH-M0-04 — Tenant Leak Harness Extraction`.

Tracker task: `T-004`.

Goal: extract a reusable `assertNoTenantLeak(rows, tenantId)` guard from the existing claim-domain list-query pattern so later M0/M3 tenant-isolation work can reuse one tested assertion path.

## Scope

- Locate the existing tenant-leak assertion in the claim server/domain read path.
- Extract the smallest reusable helper in the existing ownership boundary.
- Add focused unit proof that same-tenant rows pass and cross-tenant rows throw.
- Wire only the original touched claim list path through the helper if required to prove parity.

## Out Of Scope

- Do not apply the helper to every `server/domains/*` list query; that is `T-005`.
- Do not touch `apps/web/src/proxy.ts`, canonical routes, auth/session architecture, tenancy architecture, schemas, migrations, billing, Stripe/Paddle posture, README, AGENTS, or broad architecture docs.
- Do not start `T-006`, `T-006b`, `T-007`, `T-007b`, `T-008`, `T-009`, `T-010`, `T-011`, M1, or any product-surface slice.

## Verification Bar

- Focused tenant-leak helper tests first.
- `pnpm security:guard`.
- `pnpm pr:verify`.
- `pnpm e2e:gate` only if the implementation touches a web flow or gate surface; otherwise record why it is not relevant.
