---
status: design-review
date: 2026-05-09
slice: P33-DG16
title: Post-SEC11 Security Slice Selection
owner: platform + security + qa
phase: Phase C
---

# P33-DG16 Post-SEC11 Security Slice Selection

## Decision

`P33-DG16` is the docs-only post-SEC11 selection gate for PR `#706`.

`P33-SEC11 Paddle Lead Conversion Tenant Guard Hardening` is complete through PR `#706`,
merge commit `e8b9904bb8700ea48e5dde9ee027354044696afe`.

The next bounded implementation slice is:

`P33-SEC12 Commercial Action Idempotency Tenant Scope Hardening`

This gate promotes SEC12 because the strongest remaining DB access posture cluster is now the
five-entry commercial action idempotency helper. The cluster is coherent, already isolated in one
helper plus a small caller set, and can be hardened without route, auth, tenancy architecture,
schema, migration, Stripe, proxy, Storage, README, AGENTS, or architecture-doc work.

## Inputs

| Input                                               | Relevance                                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P33-DG15`                                          | Promoted exactly one implementation slice, `P33-SEC11 Paddle Lead Conversion Tenant Guard Hardening`, and deferred commercial idempotency for its own design.   |
| `P33-SEC11`                                         | Removed the Paddle lead conversion null-tenant fallback and preserved DB posture at `67` unclassified entries.                                                  |
| `docs/security/db-access-posture-baseline.md`       | Records the post-SEC11 posture baseline: `616` scanned entries and `67` remaining unclassified entries.                                                         |
| `docs/security/db-access-posture-burndown.md`       | Names commercial action idempotency records with optional tenant identity as a five-entry hard-case cluster.                                                    |
| `apps/web/src/lib/commercial-action-idempotency.ts` | Contains the five current unclassified DB access entries: reservation insert, conflict lookup, failure delete, completion update, and exception delete.         |
| Current callers                                     | Tenant-bound callers pass optional `session.user.tenantId`; public Free Start and business membership lead flows currently use the helper without tenant proof. |
| Current Next dependency state                       | The web app resolves `next 16.2.4`, unchanged from DG09/DG10/DG11/DG13 evidence. No Next upgrade was introduced by SEC08 through SEC11.                         |

## SEC11 Closeout

SEC11 delivered the DG15 target:

- the Paddle `transaction.completed` lead conversion branch no longer uses
  `tenantId || 'unknown'`;
- provider `customData.leadId` is treated as untrusted metadata and must normalize before use;
- lead conversion skips before domain conversion when a canonical tenant cannot be resolved;
- cross-tenant or missing leads are rejected by a domain-owned tenant-scoped ownership preflight;
- provider user or tenant metadata conflicts with canonical subscription context skip conversion;
- duplicate webhook and invalid-signature audit behavior remain unchanged;
- `pnpm check:db-access` passes with `616` scanned entries:
  `tenant-context=5`, `tenant-scoped=163`, `tenant-predicate=353`,
  `admin-privileged=0`, `system-exempt=28`, `unclassified=67`.

SEC11 intentionally left one non-blocking residual: Paddle lead payment attempts still do not have
a canonical provider transaction reference that can be safely reconciled from the current webhook
payload without broadening schema or payment architecture. DG16 does not promote that work.

## DG07 CSP Blocker Check

DG16 explicitly preserves the DG07 rule before ranking remaining work.

No unlock condition is met:

1. The resolved web Next version remains `16.2.4`, confirmed through SEC08–SEC11. No Next upgrade
   was introduced by SEC08, SEC09, SEC10, or SEC11. `pnpm --filter @interdomestik/web list next
--depth 0` still resolves `next 16.2.4`, matching DG09/DG10/DG11/DG13 evidence.
2. There is no new evidence of a supported Next header model that lets the repo keep a non-nonce
   enforced CSP beside a nonce-bearing Report-Only CSP while still propagating nonces to
   first-party framework/runtime scripts.
3. There is no approved enforced-CSP architecture change, Trusted Types/SRI
   compensating-control pivot, or retirement of the nonce-migration target.

Therefore:

- `P33-SEC03` remains `blocked-by-architecture`;
- `P33-SEC03R` is not promotable;
- CSP Phase 1 enforcement remains blocked;
- CSP unblock feasibility remains valuable, but not as a SEC03 retry or Phase 1 enforcement
  promotion.

## Residual Ranking

| Rank | Candidate                                                                 | Decision | Rationale                                                                                                                                                                                                                                                                                                                             |
| ---: | ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | `P33-SEC12 Commercial Action Idempotency Tenant Scope Hardening`          | Promote  | Five entries in one helper and focused callers. The helper stores optional tenant identity and performs reservation conflict handling before a tenant scope is guaranteed. This is the smallest coherent remaining DB posture cluster.                                                                                                |
|    2 | Non-Paddle membership billing commission ownership probe                  | Defer    | Single entry in the membership-billing commission path — the one remaining unclassified entry in `packages/domain-membership-billing` after SEC10 resolved all Paddle webhook entries. Lower risk than a shared idempotency helper used by multiple commercial mutation paths; does not need the same cross-tenant conflict handling. |
|    3 | Legacy agent dashboard reads without current tenant proof                 | Defer    | Bounded and read-oriented, but spans dashboard read contracts and should follow the commercial write-path guard.                                                                                                                                                                                                                      |
|    4 | Campaign execution and communication batch paths                          | Defer    | Requires campaign/job-level tenancy modeling and should not be mixed with action idempotency helper work.                                                                                                                                                                                                                             |
|    5 | Cron and public NPS/engagement residue                                    | Defer    | Needs public-token and scheduled-job tenancy design before implementation.                                                                                                                                                                                                                                                            |
|    6 | Admin and branch dashboard cross-tenant lookups                           | Defer    | Privileged/admin-facing and should be handled by an explicit admin-scope review.                                                                                                                                                                                                                                                      |
|    7 | Thirty-seven smaller one-off application/domain paths                     | Defer    | Still not coherent enough for one implementation slice; the SEC04B and DG14 mass-stamping rejection remains in force.                                                                                                                                                                                                                 |
|    8 | CSP Phase 1 enforcement, SEC03 retry, or full hardened-production posture | Reject   | DG07 remains unchanged. Full hardened-production or `9+/10` posture remains blocked until named residual categories are fixed or formally accepted.                                                                                                                                                                                   |

## Promoted Slice

`P33-SEC12 Commercial Action Idempotency Tenant Scope Hardening`

Implementation scope:

- harden `apps/web/src/lib/commercial-action-idempotency.ts` so each reservation runs under an
  explicit idempotency scope before any tenant-sensitive cached response can be returned;
- require a canonical non-empty `tenantId` for tenant-bound commercial actions before inserting,
  updating, deleting, or returning cached idempotency rows;
- keep public idempotency explicit and allowlisted only for flows that are intentionally public and
  do not mutate tenant-scoped commercial state;
- reject or skip tenant-bound idempotency work when the tenant scope is missing or conflicts with
  the existing reservation;
- ensure same-key cross-tenant conflicts never return another tenant's cached response and do not
  execute the commercial action under the wrong tenant;
- preserve same-tenant duplicate behavior for matching request fingerprints and completed
  reservations;
- preserve different-fingerprint reuse rejection for the same action, key, and tenant scope;
- keep the global `commercial_action_idempotency_action_key_uq` index and existing schema unless
  implementation proves helper-level scoping cannot fail closed safely. Schema or migration work is
  not promoted by this gate.

Allowed implementation touch points:

- `apps/web/src/lib/commercial-action-idempotency.ts`;
- `apps/web/src/lib/commercial-action-idempotency.test.ts`;
- narrow caller contract updates and focused tests for existing commercial idempotency callers:
  - `apps/web/src/actions/claims/submit.core.ts`;
  - `apps/web/src/actions/free-start/submit.core.ts`;
  - `apps/web/src/lib/actions/business-membership-lead.ts`;
  - `apps/web/src/actions/staff-claims/save-escalation-agreement.core.ts`;
  - `apps/web/src/actions/staff-claims/save-recovery-decision.core.ts`;
  - `apps/web/src/actions/subscription/cancel.core.ts`;
- `scripts/ci/db-access-baseline.json`;
- `docs/security/db-access-posture-baseline.md`;
- `docs/security/db-access-posture-burndown.md`;
- `docs/plans/**` for SEC12 closeout.

Must not touch:

- `apps/web/src/proxy.ts`;
- canonical routes `/member`, `/agent`, `/staff`, or `/admin`;
- auth provider layering or session shape;
- tenancy architecture;
- broad schema design or database migrations;
- Storage redesign;
- Stripe;
- README, AGENTS, or architecture docs;
- unrelated DB access posture clusters.

## SEC12 Design Notes

The implementation should make the helper's implicit optional-tenant behavior explicit. A suitable
shape is a discriminated scope contract, for example:

- tenant scope: requires `tenantId` and may include `actorUserId`;
- public scope: requires an explicit public-action reason and stores `tenantId: null`;
- missing or malformed tenant scope for a tenant-bound action returns a stable action error before
  a reservation row is inserted.

Conflict handling should separate identity resolution from cached response release. A same
`action` plus `idempotencyKey` conflict may need to inspect the existing reservation identity, but
the cached `responsePayload` must not be returned until the reservation's tenant/public scope is
proven to match the current request. A cross-tenant conflict should fail closed with a stable
idempotency error and should not execute the wrapped commercial action.

The current `findExistingReservation` helper queries by `(action, idempotency_key)` with no
`tenantId` filter. When a conflict occurs and the existing row is fetched, the function returns
whatever reservation exists regardless of tenant ownership — and the caller at the conflict branch
returns that row's `responsePayload` directly without any tenant verification. SEC12 must add
`tenantId` (or public scope) to the `findExistingReservation` WHERE clause so that a cross-tenant
key collision is never resolved by returning another tenant's cached response. Adding tenant checks
only in the outer `runCommercialActionWithIdempotency` wrapper without fixing this WHERE clause
would leave the core leak path open.

Business membership lead submission currently resolves tenant ownership inside the wrapped
execution callback. SEC12 should move the canonical tenant resolution needed for idempotency ahead
of reservation creation, or explicitly reject the flow before lead creation if tenant ownership
cannot be resolved. Free Start intake may remain public only if the implementation records that it
does not mutate tenant-scoped commercial state and keeps public idempotency allowlisted.

The expected DB posture result is `67 -> 62` unclassified entries if all five helper entries are
resolved. If any entry cannot be safely classified without schema changes, SEC12 must document the
remaining entry precisely instead of mass-stamping it.

## Acceptance Criteria For SEC12

- Tenant-bound commercial actions do not insert a `commercial_action_idempotency` row with
  `tenantId: null`.
- Tenant-bound commercial actions without canonical tenant scope return a stable action error
  before executing the wrapped mutation.
- Same-tenant duplicate requests with matching request fingerprints return the cached completed
  response without re-executing the wrapped mutation.
- Same-tenant duplicate requests with different request fingerprints return the existing
  `IDEMPOTENCY_KEY_REUSED` contract.
- Same-key cross-tenant conflicts never return another tenant's cached response and never execute
  the wrapped mutation under the wrong tenant.
- Public idempotency remains explicit, allowlisted, and limited to public flows that do not mutate
  tenant-scoped commercial state.
- Business membership lead idempotency has canonical tenant scope before reservation creation, or
  fails closed before lead creation when tenant ownership cannot be resolved.
- `pnpm check:db-access` reduces the commercial idempotency unclassified cluster where safe, with
  any residual documented by file and line.

## Verification Plan

DG16 is a docs/design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

SEC12 is an implementation slice and must additionally run:

- focused `apps/web/src/lib/commercial-action-idempotency.test.ts` coverage for missing tenant,
  tenant conflict, same-tenant duplicate, different fingerprint, execution failure cleanup,
  explicit failure cleanup, and public allowlist behavior;
- focused caller tests for claims submission, staff recovery decision, staff escalation agreement,
  subscription cancellation, business membership lead, and Free Start public idempotency where
  affected by the contract change;
- `pnpm check:db-access`;
- `pnpm security:guard`;
- mandatory implementation reviewer pool;
- diff-scoped Codex Security plugin scan after reviewer fixes;
- `pnpm verify-slice -- --required-gates`;
- PR CI/Sonar/Vercel/reviewer monitoring before merge.

## Rollback And Mitigation

DG16 is documentation-only and rolls back by reverting the plan/tracker changes.

SEC12 should be a normal helper-and-focused-caller revert. The preferred failure mode after SEC12
is skipped or rejected idempotency before the commercial mutation executes, not reuse of a
reservation from the wrong tenant or a cached response released before scope proof.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched by DG16.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth provider layering, tenant identity architecture, routing, domain architecture, broad schema
  design, Storage architecture, and Stripe remain untouched.
- DG16 does not promote CSP Phase 1 enforcement.
- DG16 does not promote a broad DB posture burn-down or mass-stamping pass.
