---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT10 Auth RLS Protected Route Runtime Tagging Foundation - 2026-06-06

> Status: Input document. This record captures the first runtime tagging foundation after the
> `ENT-ALERT09` low-cardinality tag contract. It does not create Sentry provider rules, change alert
> destinations, generate production traffic, edit `apps/web/src/proxy.ts`, or claim full enterprise
> alert coverage.

## Identity

- Slice id: `ENT-ALERT10-2026-06-06`
- Source contract: `ENT-ALERT09 Auth RLS Protected Route Telemetry Tag Contract`
- Environment considered: production telemetry code path, local proof only
- Provider considered: Sentry project `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic generated: no

## Implemented Foundation

`apps/web/src/lib/auth-enterprise-alert-tags.ts` now maps existing auth telemetry failure payloads
to Sentry messages with only the `ENT-ALERT09` approved low-cardinality tags:

| Runtime event                         | Sentry message                     | Tags emitted                                                                                         | Coverage status                                         |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `protected_route_bounce_to_login`     | `enterprise_alert.protected_route` | `enterprise_alert=protected_route`, `route_contract=canonical_protected_route`, `alert_contract=...` | implemented                                             |
| `protected_route_bounce_to_login`     | `enterprise_alert.protected_route` | `protected_route_class=member/agent/staff/admin` only when the normalized route surface is canonical | implemented                                             |
| `session_introspection_throttled`     | `enterprise_alert.auth_session`    | `enterprise_alert=auth_session`, `alert_contract=...`                                                | implemented                                             |
| `staff_post_login_redirect_failed`    | `enterprise_alert.auth_session`    | `enterprise_alert=auth_session`, `alert_contract=...`                                                | implemented                                             |
| `session_probe_skipped_after_ready`   | not emitted                        | none                                                                                                 | intentionally untagged because it is not a failure path |
| tenant-boundary or RLS failure events | not emitted by this slice          | none                                                                                                 | pending separate bounded runtime slice                  |

The shared `alert_contract` value is `ent-alert09-auth-rls-protected-route-tags-v1`.

## Safety Properties

- Sentry tags and fingerprints are limited to approved static values.
- `protected_route_class` is derived only from the normalized route surface values `member`,
  `agent`, `staff`, and `admin`.
- Unknown route surfaces still emit the protected-route category without a class.
- No tenant id, user id, branch id, claim id, document id, email, raw URL, query string, request
  body, cookie, token, hostname, provider destination id, or private route parameter is added to the
  enterprise Sentry tags, message, fingerprint, or test evidence.
- Existing D07 `slo_alert` tags and alert checks are unchanged.
- Existing auth telemetry console payloads remain structurally compatible for current tests and
  fixture diagnostics; provider rules for this lane must use only the new enterprise Sentry tags.
- `apps/web/src/proxy.ts`, canonical routes, auth/session behavior, tenancy resolution, schema, RLS,
  billing, product UI, README, AGENTS, and broad architecture docs are unchanged.

## Category Disposition

| Category               | ENT-ALERT10 disposition                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Auth/session           | Implemented for deterministic post-login redirect failures and session introspection throttling.                                    |
| Protected routes       | Implemented for deterministic protected-route login redirects and canonical route classes.                                          |
| RLS or tenant-boundary | Not claimed. No safe deterministic runtime failure hook was added because that would touch tenancy/RLS surfaces outside this slice. |

The missing `tenant_boundary` runtime tag remains an explicit enterprise gap, not a hidden success.

## Required Follow-Up

The next repo-owned enterprise alert slice should be:

`ENT-ALERT11 Auth RLS Protected Route Provider Alert Catalog Contract`

That slice should add or design the checked-in provider-rule catalog shape for the implemented
`enterprise_alert` tags, keep D07 SLO rules unchanged, and record how `tenant_boundary` will be
handled before provider coverage is claimed. It must not mutate Sentry provider state or alert
destinations unless separately authorized.

## Non-Goals

- No Sentry provider rule creation, update, deletion, destination mutation, or routed notification
  test.
- No production traffic generation, synthetic event sending, tenant-data probing, or live fixture
  exercise.
- No runtime behavior change beyond failure-path observability.
- No `apps/web/src/proxy.ts`, route, auth/session flow, tenancy, schema, RLS, billing, product UI,
  README, AGENTS, or broad architecture-doc change.
- No claim that Interdomestik is fully enterprise-ready.
