---
status: design-review
date: 2026-05-09
slice: P33-DG15
title: Post-SEC10 Security Slice Selection
owner: platform + security + qa
phase: Phase C
---

# P33-DG15 Post-SEC10 Security Slice Selection

## Decision

`P33-DG15` is the docs-only post-SEC10 selection gate for PR `#704`.

`P33-SEC10 Billing Webhook Tenant Resolution Hardening` is complete through PR `#704`,
merge commit `8c4a4ea0b75527db1485b7ee280ad6b262edbc46`.

The next bounded implementation slice is:

`P33-SEC11 Paddle Lead Conversion Tenant Guard Hardening`

This gate promotes SEC11 before another DB access posture cluster because SEC10 intentionally
left one named Paddle webhook residual outside its authorized implementation surface: the
`transaction.completed` lead conversion branch in
`apps/web/src/app/api/webhooks/paddle/_core.ts`.

## Inputs

| Input                                         | Relevance                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------- |
| `P33-DG14`                                    | Promoted exactly one implementation slice, `P33-SEC10 Billing Webhook Tenant Resolution Hardening`, limited to the billing webhook/provider-event tenant-resolution DB access posture cluster.                            |
| `P33-SEC10`                                   | Hardened Paddle webhook tenant resolution and resolved all current unclassified DB access entries under `packages/domain-membership-billing/src/paddle-webhooks/**`.                                                      |
| `docs/security/db-access-posture-burndown.md` | Records the remaining `67` unclassified DB access posture hard cases and says the next DB posture action needs targeted design rather than mass-stamping.                                                                 |
| Paddle route resolver review                  | SEC10 received explicit narrow authorization to fix `resolveWebhookTenantId`, but not the separate lead conversion block.                                                                                                 |
| Lead conversion code path                     | The route-level `transaction.completed` branch still calls `convertLeadToMember({ tenantId: tenantId                                                                                                                      |     | 'unknown' }, { leadId: customData.leadId })`, using provider metadata and an unsafe null-tenant fallback. |
| Domain lead conversion contract               | `convertLeadToMember` scopes the lead lookup by `leadId` plus `ctx.tenantId`, but the current route can pass the synthetic tenant value `'unknown'`; it also does not reconcile the lead against a canonical payment row. |

## SEC10 Closeout

SEC10 delivered the DG14 target:

- canonical subscription/user state now takes precedence over Paddle `customData`;
- conflicting provider user or tenant metadata is rejected or skipped before tenant-scoped
  subscription, dunning, checkout reconciliation, and transaction audit writes;
- invalid-signature and duplicate webhook receipt persistence remain audit-safe with nullable
  `tenantId`;
- app route `resolveWebhookTenantId` now checks canonical subscription state before falling back
  to `customData.userId`;
- `pnpm check:db-access` passes with `615` scanned entries:
  `tenant-context=5`, `tenant-scoped=162`, `tenant-predicate=353`,
  `admin-privileged=0`, `system-exempt=28`, `unclassified=67`.

DG14 inventoried `14` billing webhook/provider-event hard cases, targeting `80 -> 66`.
The synced SEC10 implementation baseline contained `13` current unclassified entries under
`packages/domain-membership-billing/src/paddle-webhooks/**`; SEC10 resolved all `13`.
The remaining `1` unclassified `packages/domain-membership-billing/src` entry is
`packages/domain-membership-billing/src/commissions/create.ts`, outside the SEC10 webhook scope.

## Residual Ranking

| Rank | Candidate                                                                 | Decision | Rationale                                                                                                                                                                                                                          |
| ---: | ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P33-SEC11 Paddle Lead Conversion Tenant Guard Hardening`                 | Promote  | Same production-facing Paddle webhook route as SEC10, explicitly named as DG15 residual, and currently contains an unsafe null-tenant fallback plus trusted provider `leadId` metadata before lead conversion.                     |
|    2 | Commercial action idempotency records with optional tenant identity       | Defer    | Still a real DB posture hard case, but optional tenant semantics need their own design and should not be mixed with the Paddle lead conversion route residual.                                                                     |
|    3 | Non-Paddle membership billing commission ownership probe                  | Defer    | Small and close to billing, but lower immediate risk than a provider-triggered conversion branch that can write member/subscription/card state.                                                                                    |
|    4 | Legacy agent dashboard reads without current tenant proof                 | Defer    | Bounded, but read-oriented and lower risk than a webhook-triggered write path.                                                                                                                                                     |
|    5 | Campaign execution and communication batch paths                          | Defer    | Requires job-level or campaign-level tenancy modeling; too broad for the next single PR.                                                                                                                                           |
|    6 | Cron and public NPS/engagement residue                                    | Defer    | Requires public-token and scheduled-job tenancy design; should not be bundled with Paddle lead conversion.                                                                                                                         |
|    7 | Admin and branch dashboard cross-tenant lookups                           | Defer    | Privileged/admin-facing and should be handled by an explicit admin-scope review rather than the provider-event path.                                                                                                               |
|    8 | Thirty-seven smaller one-off application/domain paths                     | Defer    | Still not coherent enough for one implementation slice; the SEC04B and DG14 mass-stamping rejection remains in force.                                                                                                              |
|    9 | CSP Phase 1 enforcement, SEC03 retry, or full hardened-production posture | Reject   | DG07 remains unchanged, and controlled production / pilot GO remains acceptable only with green gates. Full hardened-production or `9+/10` posture remains blocked until named residual categories are fixed or formally accepted. |

## Promoted Slice

`P33-SEC11 Paddle Lead Conversion Tenant Guard Hardening`

Implementation scope:

- update only the `transaction.completed` lead conversion branch in
  `apps/web/src/app/api/webhooks/paddle/_core.ts` plus focused app webhook tests;
- optionally touch `packages/domain-leads/src/**` only if a tiny helper is needed to validate
  lead/payment ownership without widening the domain architecture;
- fail closed or skip lead conversion before `convertLeadToMember` when `tenantId` is `null`;
- remove the synthetic `tenantId: 'unknown'` fallback;
- validate `customData.leadId` as a non-empty bounded string before using it;
- reconcile the lead against canonical repo state for the resolved tenant before conversion;
- if a payment attempt or transaction reference can be safely matched using existing data, update
  only that canonical attempt; if not, record the absence as a residual instead of broadening
  schema or payment architecture;
- preserve invalid-signature, duplicate-webhook, webhook receipt, and general Paddle event
  processing behavior;
- keep SEC10 tenant resolution precedence intact.

Allowed implementation touch points:

- `apps/web/src/app/api/webhooks/paddle/_core.ts`, limited to the lead conversion branch;
- focused tests under `apps/web/src/app/api/webhooks/paddle/**`;
- `packages/domain-leads/src/**` only for a narrow validation/helper seam if route-level checks
  cannot safely express canonical lead ownership;
- `docs/plans/**` for SEC11 closeout;
- DB posture receipts only if SEC11 changes direct DB guard classification.

Must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design or database migrations;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs;
- the wider Paddle webhook handler flow outside the lead conversion branch;
- non-Paddle DB posture clusters.

## Acceptance Criteria For SEC11

- No lead conversion path uses `tenantId || 'unknown'`.
- A `transaction.completed` event without a safely resolved tenant does not call
  `convertLeadToMember`.
- A missing, empty, malformed, or unsafe `customData.leadId` does not trigger conversion.
- A lead ID that does not belong to the resolved canonical tenant does not convert a lead.
- A provider lead ID conflict or unresolved payment attempt does not corrupt member, subscription,
  membership-card, or lead-payment state.
- Duplicate webhook and invalid-signature audit behavior remain unchanged.
- Focused app webhook tests cover null tenant, missing/malformed lead ID, cross-tenant lead
  mismatch, safe conversion, duplicate receipt behavior, and unchanged downstream
  `handlePaddleEvent` processing.

## Verification Plan

DG15 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

SEC11 is an implementation slice and must additionally run:

- focused app webhook route tests for the lead conversion branch;
- focused domain-leads tests if a helper is added there;
- `pnpm check:db-access` if any direct DB guard classification changes;
- `pnpm security:guard`;
- mandatory implementation reviewer pool;
- diff-scoped Codex Security plugin scan after reviewer fixes;
- `pnpm verify-slice -- --required-gates`;
- PR CI/Sonar/Vercel/reviewer monitoring before merge.

## Rollback And Mitigation

DG15 is documentation-only and rolls back by reverting the plan/tracker changes.

SEC11 should preserve webhook receipt, dedupe, and general event processing behavior so rollback is
a normal revert of the lead-conversion guard. The preferred failure mode after SEC11 is skipped or
failed lead conversion with audit/process failure visibility, not conversion using a synthetic or
provider-controlled tenant context.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG15.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain architecture, broad schema
  design, Storage architecture, and Stripe remain untouched.
- DG15 does not promote CSP Phase 1 enforcement.
- DG15 does not promote a broad DB posture burn-down or mass-stamping pass.
