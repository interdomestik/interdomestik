---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT06 Auth RLS Protected Route Alert Coverage Evidence Contract - 2026-06-06

> Status: Input document. This contract defines the evidence required to prove alert coverage for
> auth, RLS or tenant-boundary, and protected-route failure modes. It does not change Sentry,
> production telemetry, runtime code, auth, tenancy, routing, schema, RLS, product UI, proxy, or
> incident policy, and it does not claim full enterprise readiness.

## Purpose

Move the broader alerting-backed observability lane beyond D07 burn-rate coverage by defining the
proof required for the most security-sensitive production failure modes:

- auth/session failures that affect login, reset, callback, or role-gated access;
- RLS or tenant-boundary failures that could indicate cross-tenant access, missing tenant context,
  or critical-table policy drift; and
- protected-route failures where `/member`, `/agent`, `/staff`, or `/admin` fail open, lose tenant
  context, redirect incorrectly, or return elevated 5xx/403/401 rates.

The contract is intentionally evidence-first. A future implementation or provider exercise may add
or verify alert rules, but this slice only defines the minimum proof that would make the broader
alert-coverage claim defensible.

## Current Repo Evidence

Existing evidence is strong for the D07 SLO alert catalog but incomplete for the broader enterprise
alert lane:

- `docs/SLOS.md` names `/api/auth/*` as part of the core API latency surface, but the checked-in D07
  catalog currently alerts only on Paddle webhook processing, document downloads, and `/api/claims`
  latency.
- `docs/RUNBOOK.md` documents Sentry alert check/apply operations and incident response, including
  tenant isolation/privacy/data-integrity breach severity.
- `docs/plans/ent-alert01-alert-routing-evidence-contract-2026-06-06.md` explicitly leaves auth,
  RLS or tenant-boundary, and protected-route alert proof as separate required coverage.
- `docs/plans/ent-alert05-d07-provider-supported-notification-proof-2026-06-06.md` records that D07
  notification acknowledgement remains blocked on operator/provider evidence.
- `docs/plans/current-tracker.md` records D07 alert implementation evidence and D08 critical-table
  RLS evidence separately, but no current Sentry alert catalog proves RLS or protected-route failure
  alert coverage.
- `docs/reviews/2026-04-25-sensitive-route-ownership-map.md` documents sensitive route ownership
  that can seed protected-route alert inventory.
- `pnpm security:guard`, `pnpm db:rls:test:required`, and E2E gate flows provide release-time
  verification, but release gates are not the same as routed production alert coverage.

## Scope

In scope:

- define alert categories and minimum evidence for auth, RLS or tenant-boundary, and protected-route
  failure modes;
- define a sanitized provider-exercise template for future proof;
- define acceptance criteria that distinguish configured alerts from routed, acknowledged alerts;
- identify the next repo-owned evidence step without mutating provider state.

Out of scope:

- Sentry rule creation, update, deletion, threshold mutation, or destination mutation;
- production traffic generation, synthetic abuse, destructive tenant probes, or live data access;
- runtime code, auth, tenancy, routing, schema, RLS, product UI, proxy, billing, README, AGENTS, or
  broad architecture docs;
- recording secrets, raw PII, claim narratives, document contents, payment data, mailbox bodies, or
  private recipient identifiers in repo evidence.

## Required Alert Coverage

| Category                | Minimum failure modes to cover                                                                                          | Candidate evidence source                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Auth/session            | login callback 5xx spike, password reset route failure, session validation failure, unexpected unauthenticated redirect | Sentry metric or issue rules for auth route tags, route transaction names, and sanitized auth error fingerprints                   |
| RLS or tenant-boundary  | critical-table RLS disabled/drift signal, missing tenant context, cross-tenant denial spike, tenant resolution failure  | release-gate RLS signals plus Sentry issue or metric rules keyed to explicit tenant-boundary error fingerprints or audit markers   |
| Protected routes        | `/member`, `/agent`, `/staff`, `/admin` fail open, redirect loop, elevated 401/403/5xx, tenant-host mismatch            | Playwright gate failures for release proof plus Sentry route transaction/error rules for canonical protected-route failure signals |
| Alert routing ownership | warning and critical destinations, owner or escalation identity, acknowledgement metadata                               | provider read-only rule/action inventory and sanitized operator acknowledgement record                                             |

The exact Sentry queries, tags, thresholds, and destinations should be selected in a later
implementation slice from current telemetry and provider capabilities. This contract only fixes what
must be proven.

## Exercise Record Template

A future dated exercise record must capture:

- identity: exercise id, environment, provider/project, alert source, executor, decision owner, and
  confirmation that production traffic was not affected;
- inventory: one row each for auth/session, RLS or tenant-boundary, and protected routes, including
  rule name, provider rule id, query or signal, warning action, critical action, owner, and drift
  result;
- exercise: method, provider-supported or synthetic trigger path, trigger id/time, first received
  time, acknowledgement identity/time, triage destination, and follow-up record;
- evidence: provider drift check, rule/action inventory, release-gate correlation, notification
  evidence location, and sanitization review; and
- result: pass/fail/blocked decision, blocking and non-blocking findings, follow-up issue or PR, and
  owner sign-off.

## Acceptance Criteria

This contract is satisfied only when a future exercise record proves all of the following:

- at least one alert rule or provider-equivalent monitor exists for each required category:
  auth/session, RLS or tenant-boundary, and protected routes;
- every recorded rule has a provider rule id or immutable provider reference;
- warning and critical destinations are inspected and mapped to a named owner, team, channel, or
  escalation path without exposing private destination identifiers;
- the exercise uses a non-production-impact provider-supported test, synthetic event, or sanitized
  non-customer incident;
- at least one notification for each category is proven received and acknowledged by the intended
  owner, or the record marks that category blocked with the exact provider/operator blocker;
- the exercise captures trigger time, first received time, acknowledgement time, triage destination,
  pass/fail decision, and owner sign-off;
- release-gate evidence is correlated but not substituted for production alert-routing evidence;
- no secrets, credentials, raw PII, claim narratives, document contents, payment data, mailbox
  bodies, or private recipient identifiers are written to the repo; and
- every blocker has a follow-up owner and next action.

## Current Result

- Decision: contract defined
- Alert coverage proven by this slice: no
- Provider or production telemetry mutated: no
- Runtime/auth/tenancy/routing/schema/RLS/UI/proxy changed: no
- Remaining gap: no checked-in or provider-confirmed alert evidence yet proves routed and
  acknowledged coverage for auth/session, RLS or tenant-boundary, and protected-route failure modes.

## Recommended Next Proof

The next repo-owned enterprise-hardening slice should be:

`ENT-ALERT07 Auth RLS Protected Route Alert Surface Inventory`

That slice should perform a read-only inventory of current telemetry, Sentry rules/issues, route
transaction names, release-gate signals, and existing sensitive-route/RLS evidence. It should record
which alert categories are already observable, which require runtime telemetry tags or provider
rules, and which are blocked by provider access. It should not create or mutate Sentry rules,
generate production traffic, probe live tenant data, or edit auth, tenancy, routing, schema, RLS,
product UI, proxy, README, AGENTS, or broad architecture docs.
