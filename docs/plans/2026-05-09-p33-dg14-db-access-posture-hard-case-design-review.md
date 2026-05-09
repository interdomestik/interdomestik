---
status: design-review
date: 2026-05-09
slice: P33-DG14
title: DB Access Posture Hard-Case Design Review
owner: platform
phase: Phase C
---

# P33-DG14 DB Access Posture Hard-Case Design Review

## Decision

`P33-DG14` accepts the `P33-DG13` promotion and records the bounded design for
the next DB access posture hard-case follow-up.

The next bounded implementation slice is:

`P33-SEC10 Billing Webhook Tenant Resolution Hardening`

The implementation must reduce the SEC04B hard-case set by resolving the
Paddle billing webhook/provider-event tenant-resolution cluster. The target is
the `14` unclassified entries under `packages/domain-membership-billing/src/paddle-webhooks/**`,
plus only directly necessary tests and DB access posture baseline/report
receipts.

DG14 does not implement `P33-SEC10`. Billing webhook behavior, direct DB
callsite, guard-baseline, or test changes must wait for the implementation
slice.

## Inputs

| Input                                         | Relevance                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P33-DG13`                                    | Promoted exactly one next design-gate slice: `P33-DG14 DB Access Posture Hard-Case Design Review`.                                                            |
| `docs/security/db-access-posture-burndown.md` | Records the remaining `80` unclassified DB posture hard cases and explicitly says they should not be mass-stamped.                                            |
| `scripts/ci/db-access-baseline.json`          | Current baseline records `tenant-context=5`, `tenant-scoped=158`, `tenant-predicate=352`, `system-exempt=20`, and `unclassified=80`.                          |
| Billing webhook baseline entries              | `14` unclassified entries are in Paddle webhook handlers and persistence paths under `packages/domain-membership-billing/src/paddle-webhooks/**`.             |
| Billing webhook tests                         | Existing focused tests cover subscription handling, dunning, checkout-user reconciliation, and webhook persistence, making this cluster implementation-ready. |
| Current CSP state                             | DG07/SEC05 still block CSP Phase 1 enforcement; DG14 must not promote SEC03 retry or CSP Phase 1 enforcement.                                                 |

## Hard-Case Inventory

The SEC04B residual set remains `80` entries. DG14 reviewed all seven recorded
clusters before selecting the next slice.

| Count | Cluster                                                                                           | DG14 Decision | Rationale                                                                                                                                               |
| ----: | ------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    14 | Billing webhook handlers and persistence paths that derive tenant identity from provider events.  | Promote       | Coherent domain boundary, production-facing provider-event surface, existing tests, and enough shared context utilities to implement safely.            |
|     5 | Commercial action idempotency records with optional tenant identity.                              | Defer         | Important, but optional tenant identity and idempotency semantics need a separate commercial-action design so tenant-null behavior is not overfixed.    |
|     5 | Legacy agent dashboard reads without current tenant proof.                                        | Defer         | Bounded and valuable, but lower risk than provider-event writes and already isolated to legacy dashboard reads.                                         |
|     7 | Campaign execution and communication paths that batch across users or campaigns.                  | Defer         | Cross-user batch behavior needs job-level ownership modeling and should not be bundled with billing webhook tenant resolution.                          |
|     8 | Cron and public NPS/engagement residue that needs per-tenant job modeling or narrower predicates. | Defer         | Spans cron and public feedback flows; requires a separate job/public-token tenancy design.                                                              |
|     4 | Admin and branch dashboard cross-tenant lookup paths.                                             | Defer         | Small and privileged/admin-facing; should be handled separately so admin scope is explicit rather than conflated with provider-event tenant resolution. |
|    37 | Smaller one-off application/domain paths requiring callsite-specific migration review.            | Defer         | Largest cluster, but deliberately not coherent enough for a single safe implementation slice; must not be bulk-classified.                              |

## Promoted Slice

`P33-SEC10 Billing Webhook Tenant Resolution Hardening`

Implementation scope:

- introduce or refine a narrow Paddle webhook tenant-resolution contract for
  subscription, transaction, dunning, checkout-user reconciliation, and webhook
  event persistence paths;
- prefer canonical repo state over untrusted provider custom data when both are
  available;
- fail closed before tenant-scoped writes when a provider event cannot be mapped
  to exactly one canonical tenant/user/subscription context;
- reject or skip writes on tenant conflicts between existing user/subscription
  state and event custom data;
- preserve invalid-signature and duplicate-webhook audit behavior, including
  `tenantId: null` where the event cannot be safely resolved;
- reduce the DB access posture unclassified count by the billing webhook
  cluster, targeting `80 -> 66` if all `14` entries can be safely resolved;
- update the DB access baseline and security posture receipt only for the
  changed billing webhook entries;
- add focused tests for tenant mismatch, missing tenant context, provider
  custom-data fallback, existing subscription canonical tenant precedence,
  checkout-user reconciliation, dunning persistence, transaction audit context,
  and duplicate webhook persistence behavior.

Allowed implementation touch points:

- `packages/domain-membership-billing/src/paddle-webhooks/**`;
- focused billing webhook tests under
  `packages/domain-membership-billing/src/paddle-webhooks/**`;
- narrow app webhook tests under `apps/web/src/app/api/webhooks/paddle/**` only
  if the tenant-resolution contract requires route-level coverage;
- `scripts/ci/db-access-baseline.json`;
- `docs/security/db-access-posture-baseline.md`;
- `docs/security/db-access-posture-burndown.md`;
- `docs/plans/**` for implementation closeout.

Must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design or database migrations;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs;
- non-billing DB posture clusters, except for read-only inspection.

## Acceptance Criteria For SEC10

- The billing webhook hard-case cluster is either safely classified or reduced
  with reviewed code changes; the implementation must not mass-stamp
  directives.
- `pnpm check:db-access` passes and the baseline shows no new unclassified
  entries.
- If all `14` billing webhook entries are resolved, the unclassified count drops
  from `80` to `66`; if fewer entries can be safely resolved, the PR must record
  the exact residual and why it was not safe to classify.
- Subscription-created, subscription-updated, past-due/dunning, transaction
  completed, checkout-user reconciliation, invalid-signature persistence, and
  duplicate-webhook persistence behavior remain covered by focused tests.
- Tenant mismatch or missing tenant context fails closed before tenant-scoped
  writes.
- CD, CI, seeded E2E credential, Storage, CSP, proxy, auth, tenancy
  architecture, schema, and route behavior remain unchanged.

## Rejected Alternatives

| Alternative                                        | Decision | Reason                                                                                                                                           |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Burn down all remaining `80` entries in one PR     | Reject   | SEC04B explicitly prohibited mass-stamping, and the residual set spans unrelated ownership and tenancy patterns.                                 |
| Promote the `37` one-off paths first               | Reject   | It is the largest cluster, but not coherent enough for one bounded implementation slice; each path needs callsite-specific migration review.     |
| Promote commercial idempotency first               | Defer    | Smaller and important, but optional tenant identity semantics need their own design to avoid breaking intended tenant-null idempotency behavior. |
| Promote campaign/cron/NPS work first               | Defer    | Batch and public-token flows need job-level tenancy modeling; they are broader than the billing webhook cluster.                                 |
| Promote admin/branch dashboard lookups first       | Defer    | Small and privileged/admin-facing; better handled as a separate admin-scope review.                                                              |
| Promote CSP Phase 1 enforcement or SEC03 retry     | Reject   | DG07 remains unchanged, and no concrete CSP unlock condition has been recorded.                                                                  |
| Treat controlled production as hardened production | Reject   | Current posture supports controlled production / pilot GO with green gates, not a full hardened-production or `9+/10` claim.                     |

## Verification Plan

DG14 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

`P33-SEC10` is an implementation slice and must additionally run:

- focused Paddle webhook unit tests for changed handlers and utilities;
- `pnpm check:db-access`;
- `pnpm security:guard`;
- mandatory implementation reviewer pool;
- diff-scoped Codex Security plugin scan after reviewer fixes;
- `pnpm verify-slice -- --required-gates`;
- PR CI/Sonar/Vercel/reviewer monitoring before merge.

## Rollback And Mitigation

SEC10 should preserve existing webhook event dedupe and audit semantics so the
rollback path remains a normal revert of the tenant-resolution code and baseline
diff. If a provider event cannot be resolved to a safe tenant context after the
change, the handler must fail closed or skip tenant-scoped writes with audit
metadata instead of falling back to unsafe custom-data trust.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG14.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain
  unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain
  architecture, broad schema design, Storage architecture, and Stripe remain
  untouched.
- DG14 does not promote CSP Phase 1 enforcement.
- DG14 does not promote SEC03 retry because no concrete DG07 unlock condition is
  recorded.
