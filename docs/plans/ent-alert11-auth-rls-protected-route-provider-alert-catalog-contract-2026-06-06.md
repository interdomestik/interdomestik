---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT11 Auth RLS Protected Route Provider Alert Catalog Contract - 2026-06-06

> Status: Input document. This record captures the checked-in provider alert catalog contract after
> `ENT-ALERT10`. It does not create, update, delete, or route Sentry provider rules; mutate alert
> destinations; generate traffic; or claim enterprise alert coverage.

## Identity

- Slice id: `ENT-ALERT11-2026-06-06`
- Source runtime foundation: `ENT-ALERT10 Auth RLS Protected Route Runtime Tagging Foundation`
- Environment considered: production telemetry catalog, local proof only
- Provider considered: Sentry project `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic generated: no

## Implemented Catalog Contract

`scripts/sentry-enterprise-alerts-lib.mjs` now defines a separate enterprise alert catalog instead
of extending or overloading the D07 SLO catalog. `scripts/sentry-enterprise-alerts.mjs` exposes
direct read-only `catalog` and `check` commands. There is intentionally no enterprise `apply`
command in this slice.

| Rule id                              | Provider rule name                              | Query                                                                                          | Runtime status      | Coverage claim |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------- | -------------- |
| `ent-alert-auth-session-coverage`    | `[ENT] Auth/session failure coverage`           | `enterprise_alert:auth_session alert_contract:ent-alert09-auth-rls-protected-route-tags-v1`    | implemented         | not yet proven |
| `ent-alert-protected-route-coverage` | `[ENT] Protected route failure coverage`        | `enterprise_alert:protected_route route_contract:canonical_protected_route alert_contract:...` | implemented         | not yet proven |
| `ent-alert-tenant-boundary-coverage` | `[ENT] Tenant boundary or RLS failure coverage` | `enterprise_alert:tenant_boundary alert_contract:ent-alert09-auth-rls-protected-route-tags-v1` | pending runtime tag | not yet proven |

Each catalog rule uses:

- dataset: `events_analytics_platform`
- aggregate: `count()`
- query type: `1`
- time window: `60`
- threshold type: `0`
- warning threshold: `1`
- critical threshold: `5`

These values are catalog defaults for drift-checkable provider shape only. They do not prove that
provider rules exist, are routed, or have been acknowledged.

## Safety Properties

- The enterprise catalog is separate from `D07_SENTRY_ALERTS`; existing D07 SLO alert checks and
  apply behavior are unchanged.
- Provider queries use only `ENT-ALERT09` low-cardinality terms.
- Provider queries do not include tenant ids, user ids, branch ids, claim ids, document ids,
  emails, cookies, tokens, URLs, raw paths, route parameters, hostnames, request bodies, or private
  destination identifiers.
- The read-only `check` command compares remote `[ENT]` metric alert rules only when Sentry
  credentials are present. With missing configuration, it returns catalog-only output instead of
  simulating remote success.
- The tenant-boundary rule remains cataloged as `pending_runtime_tag`; provider coverage cannot be
  claimed until a later bounded runtime slice emits the deterministic `tenant_boundary` tag safely.
- There is no Sentry provider mutation path for enterprise rules in this slice.

## Local Proof

- `scripts/sentry-enterprise-alerts.test.mjs` proves the three category definitions, payload shape,
  low-cardinality query contract, private-identifier exclusion, validation rejection for unsupported
  category or threshold drift, and exact-name drift comparison.
- `node scripts/sentry-enterprise-alerts.mjs catalog --json` emits the checked-in catalog.
- `node scripts/sentry-enterprise-alerts.mjs check --json` performs a read-only remote comparison
  only when Sentry configuration is present; otherwise it returns catalog-only output.

## Required Follow-Up

The next repo-owned enterprise alert slice should be:

`ENT-ALERT12 Auth RLS Protected Route Provider Drift Check Evidence Attempt`

That slice should run the new read-only enterprise alert check against the available Sentry
configuration, record missing, changed, and unchanged provider rules, record provider rule ids only
if returned by Sentry, and explicitly preserve `tenant_boundary` as unclaimed until runtime tagging
exists. It must not create or mutate provider rules or alert destinations unless separately
authorized.

## Non-Goals

- No Sentry provider rule creation, update, deletion, destination mutation, or routed notification
  acknowledgement.
- No production traffic generation, synthetic provider event, tenant-data probing, or live fixture
  exercise.
- No runtime auth/session, tenancy, routing, schema, RLS, billing, product UI, proxy, README,
  AGENTS, or broad architecture-doc change.
- No claim that Interdomestik is fully enterprise-ready.
