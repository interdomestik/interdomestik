---
status: implementation
date: 2026-05-09
slice: P33-SEC10
title: Billing Webhook Tenant Resolution Hardening
owner: platform + security + qa
phase: Phase C
---

# P33-SEC10 Billing Webhook Tenant Resolution Hardening

## Summary

P33-SEC10 implements the DG14-promoted Paddle billing webhook tenant-resolution hardening
slice. The implementation keeps `apps/web/src/proxy.ts`, canonical routes, auth/session
architecture, tenancy architecture, schema/migrations, Storage, Stripe, README, AGENTS, and
architecture docs unchanged.

## Implementation

- Paddle subscription context now treats persisted subscription and user records as canonical
  and rejects conflicting provider `customData.userId` or `customData.tenantId` before
  subscription writes.
- The app webhook tenant resolver now checks canonical subscription state before using
  provider `customData.userId` as a fallback and classifies that fallback as `system-exempt`.
- Subscription upserts now constrain fallback lookups and updates with canonical tenant context.
- Past-due/dunning handling now resolves through canonical subscription/user state, rejects
  provider user or tenant conflicts, and keeps dunning writes tenant-scoped.
- Transaction audit context now skips tenant-scoped audit writes when provider tenant or user
  metadata conflicts with canonical subscription/user state.
- Checkout-user reconciliation now detects conflicting subscription-vs-transaction custom data
  before member creation or update and reloads the final user with the reconciled tenant.
- Invalid-signature and duplicate webhook receipt persistence remain best-effort audit paths and
  preserve nullable `tenantId` when safe tenant resolution is unavailable.

## DB Access Posture Result

`pnpm check:db-access` passes with `615` scanned entries and posture counts:

| Tenant posture     | Count |
| ------------------ | ----: |
| `tenant-context`   |     5 |
| `tenant-scoped`    |   165 |
| `tenant-predicate` |   353 |
| `admin-privileged` |     0 |
| `system-exempt`    |    25 |
| `unclassified`     |    67 |

DG14 inventoried `14` billing webhook/provider-event hard cases, targeting `80 -> 66`.
The synced implementation baseline at `f34d0b48ba1b822facff5ee231b5f993f7070174` contained
`13` unclassified entries under `packages/domain-membership-billing/src/paddle-webhooks/**`.
P33-SEC10 resolves all `13`; there are now `0` unclassified entries under that package path.
The remaining `1` `packages/domain-membership-billing/src` unclassified entry is
`packages/domain-membership-billing/src/commissions/create.ts`, outside the DG14-authorized
Paddle webhook scope.

## DG15 Residual

The Paddle lead conversion block in `apps/web/src/app/api/webhooks/paddle/_core.ts` remains a
named DG15 residual and was not changed by SEC10. It still needs a design decision for null
tenant handling before lead conversion, validation of provider `customData.leadId`, and completion
or removal of the incomplete TODO-marked lead payment logic.

## Verification Plan

- Focused Paddle webhook unit tests for subscription context, subscription upsert, dunning,
  transaction audit, checkout-user reconciliation, and webhook receipt persistence.
- `pnpm check:db-access`.
- `pnpm security:guard`.
- `pnpm verify-slice -- --static`.
- `pnpm verify-slice -- --required-gates`.
- Mandatory implementation reviewer pool and diff-scoped Codex Security scan before required
  gates.

## Rollback

Rollback is a normal revert of the package hardening changes and DB access posture receipts. The
failure mode after rollback would be a return to pre-SEC10 provider-event tenant fallback behavior;
invalid-signature and duplicate webhook audit persistence remain compatible in either direction.
