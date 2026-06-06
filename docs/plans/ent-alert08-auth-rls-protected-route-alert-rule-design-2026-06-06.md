---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT08 Auth RLS Protected Route Alert Rule Design - 2026-06-06

> Status: Input document. This rule design converts the `ENT-ALERT06` evidence contract and
> `ENT-ALERT07` inventory into the smallest safe alert-rule plan for auth/session, RLS or
> tenant-boundary, and canonical protected-route failure modes. It does not create or mutate Sentry
> rules, change alert destinations, generate traffic, or edit runtime code.

## Identity

- Design id: `ENT-ALERT08-2026-06-06`
- Environment considered: production telemetry, read-only
- Provider considered: Sentry project `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic affected: no

## Inputs

- `ENT-ALERT06` defines required coverage for auth/session, RLS or tenant-boundary, and protected
  routes.
- `ENT-ALERT07` found exactly three provider metric alert rules, all D07, and no dedicated
  auth/RLS/protected-route alert rules.
- `scripts/sentry-alerts-lib.mjs` currently catalogs only the three D07 `slo_alert:*` metric rules.
- Runtime `slo_alert` tags currently exist only for Paddle webhooks, document downloads, and
  `/api/claims`.
- Sentry issue searches found auth-route and member/RLS issue signals, but no issue signal for
  `/agent`, `/staff`, or `/admin` in the supported `14d` query window.
- Release gates and RLS tests are strong release proof, but they are not routed provider alerts.

## Design Decision

Existing issue fingerprints are not sufficient as the first durable alert-rule foundation.

Rationale:

- The observed auth and RLS issue titles are useful evidence, but they are error-shape dependent and
  not a stable category contract.
- Protected-route coverage must include `/member`, `/agent`, `/staff`, and `/admin`; current issue
  inventory has no recent `/agent`, `/staff`, or `/admin` provider signal.
- Release-gate failures prove pre-merge regressions, not production routed alert coverage.
- Provider alert rules need stable, low-cardinality dimensions before warning and critical routing
  can be made repeatable and drift-checkable.

The smallest safe next foundation is a repo-owned telemetry category contract first, followed by
provider-rule catalog implementation and then provider proof. Runtime tagging may be required, but
it must be designed as a narrow observability contract before any provider rule mutation.

## Proposed Alert Categories

| Category               | Stable signal family                                | Initial provider rule shape                                                  | Required owner proof                                                |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Auth/session           | `enterprise_alert:auth_session`                     | Issue or metric rule for auth route failures and session validation failures | warning and critical destinations mapped to platform/on-call owner  |
| RLS or tenant-boundary | `enterprise_alert:tenant_boundary`                  | Issue rule for explicit tenant-boundary/RLS posture failures                 | warning and critical destinations mapped to platform/security owner |
| Protected routes       | `enterprise_alert:protected_route` plus route class | Metric or issue rule grouped by canonical route class                        | warning and critical destinations mapped to platform/on-call owner  |

The signal names are design targets, not implemented tags. A future implementation must confirm the
exact provider-supported query fields before adding them to the checked-in catalog.

## Provider Rule Plan

1. Add a separate checked-in enterprise alert catalog instead of overloading the D07 catalog.
2. Keep D07 metric alerts unchanged and drift-checked as they are today.
3. Define one provider rule per required category before any fan-out:
   - `[ENT] Auth/session failure coverage`
   - `[ENT] Tenant boundary or RLS failure coverage`
   - `[ENT] Protected route failure coverage`
4. Require warning and critical triggers on every rule.
5. Require provider rule id, sanitized query, owner, warning action count, critical action count,
   and drift result in the first proof record.
6. Treat route-class grouping as acceptable only if every canonical route class is represented in
   either the query, the event tag, or a bounded release-correlation table.

## Telemetry Tagging Plan

Runtime tagging should be narrow and low cardinality:

- `enterprise_alert=auth_session` for auth/session failures.
- `enterprise_alert=tenant_boundary` for missing tenant, RLS posture, or tenant-resolution failures.
- `enterprise_alert=protected_route` for canonical protected-route failures.
- `protected_route_class=member|agent|staff|admin` only when the route class is already known from
  deterministic routing context.

Do not tag tenant ids, user ids, branch ids, claim ids, document ids, emails, route parameters,
request bodies, cookies, or private destination ids as part of this alert contract.

## Sequencing

| Step | Slice                                                         | Purpose                                                                                                | Provider mutation                      |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1    | `ENT-ALERT09 Auth RLS Protected Route Telemetry Tag Contract` | Define exact tag names, allowed values, owners, forbidden data, and tests for bounded runtime tagging. | no                                     |
| 2    | future implementation slice                                   | Add the minimal runtime tags and tests if the contract still requires them.                            | no                                     |
| 3    | future provider catalog slice                                 | Extend checked-in alert catalog and drift check for the three enterprise rules.                        | no or dry-run only                     |
| 4    | future provider apply/proof slice                             | Create or verify provider rules and record routed acknowledgement evidence.                            | yes, only after explicit authorization |

## Acceptance Criteria For Future Rule Proof

A future provider proof may claim coverage only when:

- every required category has a provider rule id or immutable provider reference;
- warning and critical triggers exist for every rule;
- destinations are mapped to named owners without exposing private recipient ids;
- any runtime tag used by a rule is covered by a checked-in low-cardinality contract and focused
  tests;
- route coverage accounts for `/member`, `/agent`, `/staff`, and `/admin`;
- a provider-supported test, sanitized non-customer incident, or non-production synthetic event
  proves receipt and acknowledgement;
- release gates are cited only as correlation evidence; and
- no secrets, raw PII, claim narratives, document contents, payment data, cookies, or private
  destination identifiers are written to repo evidence.

## Result

- Decision: rule design complete
- Provider alert rules created or changed: no
- Runtime telemetry changed: no
- Alert coverage proven by this slice: no
- Required next repo-owned slice:
  `ENT-ALERT09 Auth RLS Protected Route Telemetry Tag Contract`

## Non-Goals

- No Sentry rule creation, update, deletion, threshold mutation, or destination mutation.
- No production traffic generation or synthetic route probing.
- No runtime, proxy, auth, tenancy, routing, schema, RLS, billing, product UI, README, AGENTS, or
  broad architecture-doc change.
- No claim that Interdomestik is fully enterprise-ready.
