---
status: implementation
date: 2026-05-09
slice: P33-SEC11
title: Paddle Lead Conversion Tenant Guard Hardening
owner: platform + security + qa
phase: Phase C
---

# P33-SEC11 Paddle Lead Conversion Tenant Guard Hardening

## Summary

P33-SEC11 implements the DG15-promoted Paddle `transaction.completed` lead conversion guard.
The implementation keeps `apps/web/src/proxy.ts`, canonical routes, auth/session architecture,
tenancy architecture, schema/migrations, Storage, Stripe, README, AGENTS, and architecture docs
unchanged.

## Implementation

- The Paddle route no longer calls `convertLeadToMember` with `tenantId || 'unknown'`.
- Lead conversion now skips before domain conversion when the webhook cannot resolve a canonical
  tenant.
- Provider `customData.leadId` is treated as untrusted metadata and must normalize to a non-empty
  bounded identifier before use.
- Transaction tenant resolution now checks explicit Paddle subscription references before the
  transaction `id`, so `transaction.completed` events do not fall back to provider
  `customData.userId` while a canonical `subscriptionId` is available.
- Cross-tenant or missing leads are skipped by a domain-owned tenant-scoped lead ownership
  preflight before `convertLeadToMember`.
- Provider user or tenant metadata conflicts with canonical subscription context skip lead
  conversion before any member, subscription, card, or lead write.
- Unexpected domain conversion failures still mark the webhook failed and rethrow through the
  existing webhook processing failure path.
- Duplicate webhook receipts and invalid-signature persistence remain unchanged and do not attempt
  lead conversion.
- SEC10 tenant resolution precedence remains unchanged: canonical subscription state is checked
  before provider `customData.userId` fallback.

## Residual

Paddle lead payment attempts still do not have a canonical provider transaction reference that can
be safely reconciled from the current webhook payload without broadening schema or payment
architecture. SEC11 therefore does not update lead payment attempt state from the route-level
branch. A future slice should either add a canonical attempt-to-provider reference or explicitly
accept this absence.

## DB Access Posture Result

`pnpm check:db-access` passes with `616` scanned entries and posture counts:

| Tenant posture     | Count |
| ------------------ | ----: |
| `tenant-context`   |     5 |
| `tenant-scoped`    |   163 |
| `tenant-predicate` |   353 |
| `admin-privileged` |     0 |
| `system-exempt`    |    28 |
| `unclassified`     |    67 |

SEC11 adds one reviewed tenant-scoped helper in `packages/domain-leads/src/convert.ts` and does
not change the remaining unclassified hard-case count.

## Verification Plan

- Focused app webhook route tests for safe conversion, null tenant skip, missing/empty/malformed
  lead IDs, cross-tenant or missing lead skip, provider customData conflict skip, subscriptionId
  precedence over transaction id, duplicate receipt behavior, invalid-signature behavior, and
  unexpected conversion failure handling.
- Focused domain-leads tests for the tenant-scoped lead ownership helper.
- `pnpm check:db-access`.
- `pnpm security:guard`.
- `pnpm verify-slice -- --static`.
- `pnpm verify-slice -- --required-gates`.
- Mandatory implementation reviewer pool and diff-scoped Codex Security scan before required
  gates.

## Rollback

Rollback is a normal revert of the route-level guard and focused tests. The failure mode after
rollback would be a return to the pre-SEC11 synthetic tenant fallback and direct provider
`customData.leadId` use in the Paddle lead conversion branch.
