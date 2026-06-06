---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT09 Auth RLS Protected Route Telemetry Tag Contract - 2026-06-06

> Status: Input document. This contract fixes the low-cardinality telemetry tags required before
> runtime enterprise alert tagging or provider alert catalog work can safely start. It does not edit
> runtime code, create Sentry rules, change alert destinations, generate traffic, probe tenant data,
> or claim alert coverage.

## Identity

- Contract id: `ENT-ALERT09-2026-06-06`
- Source design: `ENT-ALERT08 Auth RLS Protected Route Alert Rule Design`
- Environment considered: production telemetry, design-only
- Provider considered: Sentry project `interdmestik-nextjs`
- Executor: Codex local repo operator
- Decision owner: platform
- Production traffic affected: no

Slug note: the observed `SENTRY_PROJECT` value from the current alert lane is
`interdmestik-nextjs`. Older D07 records may reference the earlier `interdomestik-nextjs` spelling;
this contract follows the live slug used by `ENT-ALERT04` through `ENT-ALERT08`.

## Inputs

- `ENT-ALERT06` requires future alert evidence for auth/session, RLS or tenant-boundary, and
  canonical protected-route failure modes.
- `ENT-ALERT07` found no dedicated provider alert rules for those categories and no recent
  provider issue signal for `/agent`, `/staff`, or `/admin`.
- `ENT-ALERT08` decided that existing issue fingerprints are useful evidence but not a stable
  enough first provider-rule foundation, and it requires a low-cardinality telemetry contract
  before runtime tags or provider catalog mutation.
- Current checked-in D07 tagging uses `Sentry.setTag('slo_alert', '<stable value>')` for Paddle
  webhooks, document downloads, and `/api/claims`; this contract creates a separate enterprise alert
  namespace instead of overloading D07 SLO tags.

## Contracted Tags

Only the following new enterprise alert tags are approved for the future runtime-tagging slice:

| Tag key                 | Allowed values                                 | Required when                                                                                  | Owner             |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| `enterprise_alert`      | `auth_session`                                 | A deterministic auth or session failure is captured for login, callback, reset, or validation. | platform/on-call  |
| `enterprise_alert`      | `tenant_boundary`                              | A deterministic missing-tenant, tenant-resolution, RLS posture, or boundary failure is caught. | platform/security |
| `enterprise_alert`      | `protected_route`                              | A deterministic canonical protected-route failure is captured.                                 | platform/on-call  |
| `protected_route_class` | `member`, `agent`, `staff`, `admin`            | `enterprise_alert=protected_route` and the route class is known from deterministic context.    | platform/on-call  |
| `route_contract`        | `canonical_protected_route`                    | Optional with `enterprise_alert=protected_route` when a provider query needs a stable family.  | platform/on-call  |
| `alert_contract`        | `ent-alert09-auth-rls-protected-route-tags-v1` | Optional for all events covered by this contract when implementation proof needs versioning.   | platform          |

No other values are allowed without a new evidence record. The contract intentionally uses one
generic `enterprise_alert` key so provider rules can query stable category values and avoid
cardinality growth.

## Forbidden Data

The future runtime implementation must not add any of the following to the contracted tags, tag
values, extra context, fingerprints, breadcrumbs, issue titles, or repo evidence:

- tenant ids, user ids, branch ids, claim ids, document ids, registration ids, payment ids, or
  provider destination ids;
- email addresses, phone numbers, names, mailbox subjects or bodies, claim narratives, document
  contents, request bodies, cookies, authorization headers, session tokens, or private route
  parameters;
- raw database URLs, Supabase keys, Sentry tokens, Paddle credentials, or deployment secrets;
- unbounded request paths, full URLs, query strings, hostnames that can identify a customer tenant,
  or stack-local values that would create one issue per tenant, user, claim, or document.

Existing legacy Sentry tags such as `tenantId`, `branchId`, or `claimId` are not approved as part of
this enterprise alert contract and must not be used by future provider rules for this lane.

## Event Selection Rules

Future runtime tagging must be fail-closed and narrow:

- tag only caught error or failure paths, not every successful request;
- tag only deterministic boundary failures that are already known to the code path;
- derive `protected_route_class` from canonical route family or role surface, not from raw URL
  parsing when the value is ambiguous;
- omit `protected_route_class` if the route class cannot be proven as one of `member`, `agent`,
  `staff`, or `admin`;
- do not tag public routes, marketing routes, webhook routes, or non-canonical dashboards under this
  contract;
- keep D07 `slo_alert` tags unchanged and do not mix D07 SLO values with `enterprise_alert` values.

## Required Test Contract For Runtime Slice

A future runtime-tagging implementation may claim this contract only when focused tests prove:

- each `enterprise_alert` value is emitted on at least one deterministic failure path or the slice
  records why that category must wait for a later bounded implementation;
- `protected_route_class` is emitted only for `member`, `agent`, `staff`, and `admin`;
- no test asserts or introduces tenant ids, user ids, branch ids, claim ids, document ids, emails,
  raw paths with parameters, request bodies, cookies, tokens, or private destination ids as
  enterprise alert tags;
- existing D07 `slo_alert` tests still pass unchanged;
- canonical routes `/member`, `/agent`, `/staff`, and `/admin` are not renamed, bypassed, or moved;
- `apps/web/src/proxy.ts` remains untouched unless a later explicitly authorized routing slice
  proves a stronger need.

## Provider Query Contract

Future provider catalog work may only query these low-cardinality shapes from this lane:

```text
enterprise_alert:auth_session
enterprise_alert:tenant_boundary
enterprise_alert:protected_route
enterprise_alert:protected_route protected_route_class:member
enterprise_alert:protected_route protected_route_class:agent
enterprise_alert:protected_route protected_route_class:staff
enterprise_alert:protected_route protected_route_class:admin
```

`route_contract` and `alert_contract` are optional secondary conjuncts only. They may narrow one of
the allowed `enterprise_alert` queries after runtime proof shows those tags are emitted, but they
must not be used as standalone provider queries or as substitutes for the category queries above.

Provider rules must still be proven separately with warning and critical triggers, provider rule ids,
owner mapping, drift results, and routed acknowledgement evidence. This contract does not prove
provider coverage.

## Result

- Decision: telemetry tag contract complete
- Runtime telemetry changed: no
- Provider alert rules created or changed: no
- Alert coverage proven by this slice: no
- Required next repo-owned slice:
  `ENT-ALERT10 Auth RLS Protected Route Runtime Tagging Foundation`

## Non-Goals

- No runtime code, tests, Sentry catalog, provider state, alert destination, traffic, auth, tenancy,
  routing, schema, RLS, billing, product UI, proxy, README, AGENTS, or broad architecture-doc change.
- No production event triggering, synthetic provider event, or live tenant-data probing.
- No claim that Interdomestik is fully enterprise-ready.
