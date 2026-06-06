---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-ALERT14 Tenant Boundary Runtime Tagging Design Gate - 2026-06-06

> Status: Input document. This design gate scopes the smallest safe runtime implementation needed
> to emit the `ENT-ALERT09` `enterprise_alert=tenant_boundary` tag. It does not change runtime code,
> schema, RLS, provider rules, alert destinations, traffic, proxy, routes, auth, or tenancy.

## Identity

- Slice id: `ENT-ALERT14-2026-06-06`
- Source handoff: `ENT-ALERT13 Auth RLS Protected Route Provider Rule Creation Authorization Handoff`
- Contract: `ENT-ALERT09 Auth RLS Protected Route Telemetry Tag Contract`
- Environment considered: production runtime design, local repo evidence only
- Decision owner: platform/security
- Production traffic affected: no

## Goal

Define a reviewed, bounded implementation path for tenant-boundary runtime tagging so the checked-in
provider catalog can eventually move the `[ENT] Tenant boundary or RLS failure coverage` rule from
`pending_runtime_tag` to implemented runtime evidence.

The first implementation must cover deterministic tenant-boundary failures that already fail closed
before data access. It must not instrument successful tenant-scoped requests or add broad RLS
observability across the database layer.

## Repo Evidence

| Surface                                          | Current behavior                                          | Design disposition                                            |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/app/api/tenant-boundary.ts`        | Wraps `ensureTenantId()` and returns `401` on failure.    | Preferred first runtime hook because it is narrow and shared. |
| `packages/shared-auth/src/session.ts`            | Throws `MissingTenantError` when session tenant is empty. | Do not instrument directly; package-wide blast radius.        |
| `apps/web/src/lib/safe-action.ts`                | Catches missing tenant and returns `MISSING_TENANT`.      | Optional second hook only if covered by focused tests.        |
| `apps/web/src/lib/auth-enterprise-alert-tags.ts` | Emits `auth_session` and `protected_route` categories.    | Reuse pattern for a tenant-boundary helper.                   |
| `scripts/sentry-enterprise-alerts-lib.mjs`       | Catalogs tenant-boundary rule as pending runtime tag.     | Do not change provider catalog until runtime proof lands.     |

## Approved Implementation Shape

The next implementation slice may add a narrow helper, for example
`captureEnterpriseTenantBoundaryAlert(...)`, colocated with the existing enterprise alert tagging
helper. The helper may emit only:

- message: `enterprise_alert.tenant_boundary`
- level: `warning`
- tags:
  - `enterprise_alert=tenant_boundary`
  - `alert_contract=ent-alert09-auth-rls-protected-route-tags-v1`
- fingerprint: static values only, such as `enterprise-alert`, `tenant_boundary`, and
  `missing_tenant_identity`.

The first runtime slice must not add new tag keys such as `tenant_boundary_reason` without a new
telemetry contract record, because `ENT-ALERT09` allows no other enterprise alert tag values.

The first caller should be `resolveTenantBoundary()` because it already owns a deterministic
missing-tenant fail-closed response before data access. A second caller in `runAuthenticatedAction()`
may be included only if the same helper and tests prove no duplicate or private tags.

## Forbidden Data

The implementation must not send or assert tenant ids, user ids, branch ids, agent ids, claim ids,
document ids, emails, hostnames, raw paths, URLs, query strings, cookies, tokens, authorization
headers, request bodies, stack-local object dumps, provider destination ids, or private route
parameters in Sentry tags, messages, fingerprints, logs, test snapshots, docs, or provider queries.

Existing legacy Sentry tags such as `tenantId`, `branchId`, and `userRole` are not approved for the
tenant-boundary enterprise alert rule. Provider queries for this lane must continue to use only the
low-cardinality `ENT-ALERT09` contract.

## Rejected Alternatives

- Instrumenting `ensureTenantId()` in `@interdomestik/shared-auth`: rejected because it affects every
  auth boundary across web and packages and could duplicate events or change package behavior.
- Instrumenting the database/RLS layer: rejected for this slice because it would touch Tier 3 schema,
  RLS, or data-access semantics without a separate implementation design.
- Adding provider rule creation together with runtime tagging: rejected because ENT-ALERT13 records
  missing authorization, owner, and alert-action destination evidence.
- Tagging successful tenant-scoped requests: rejected because the alert contract is for failure
  paths only and would create noisy telemetry.

## Required Test Plan For Implementation

The next runtime implementation must prove:

- missing tenant identity emits exactly one `enterprise_alert.tenant_boundary` Sentry message on the
  selected boundary helper path;
- emitted tags and fingerprints contain only the approved static values;
- no tenant, user, branch, claim, document, email, URL, raw path, cookie, token, request body, or
  provider destination data appears in tags or assertions;
- existing `auth_session` and `protected_route` enterprise alert tests still pass;
- selected callers still fail closed with the existing response contracts;
- `apps/web/src/proxy.ts` and canonical routes remain untouched.

Suggested focused proof:

```bash
pnpm --filter @interdomestik/web test:unit --run src/lib/auth-enterprise-alert-tags.test.ts
pnpm --filter @interdomestik/web test:unit --run src/app/api/tenant-boundary.test.ts
```

If a dedicated tenant-boundary unit test file does not exist, the implementation slice should add
one instead of relying on unrelated route tests.

## Rollout And Rollback

Runtime rollout should be additive observability only. Rollback is a code revert of the helper and
call site. No data migration, provider mutation, alert destination change, or traffic replay is
authorized by this gate.

## Required Follow-Up

The next repo-owned enterprise alert slice should be:

`ENT-ALERT15 Tenant Boundary Runtime Tagging Foundation`

That slice should implement only the approved narrow runtime helper and first deterministic
tenant-boundary caller, with focused tests and no provider-rule creation. Provider coverage must
remain unclaimed until a later authorized provider-rule apply and routed acknowledgement proof.

## Non-Goals

- No runtime implementation in this design gate.
- No Sentry provider rule creation, update, deletion, destination mutation, or acknowledgement.
- No production traffic generation, synthetic event, tenant-data probe, schema/RLS change, auth or
  tenancy refactor, routing/proxy change, billing change, product UI change, README, AGENTS, current
  tracker/program, or broad architecture-doc change.
- No claim that Interdomestik is fully enterprise-ready.
