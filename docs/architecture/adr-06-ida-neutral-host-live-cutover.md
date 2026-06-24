---
status: accepted
date: 2026-06-24
owner: platform + architecture + qa
tracker: T-505, T-107
---

# ADR-06: IDA Neutral Host And Live Login Cutover

## Status

Accepted.

## Context

Interdomestik originally served public, authentication, and dashboard entry
points through country-host aliases. That made country identity too easy to
confuse with tenant identity, booking context, legal entity context, or
authenticated session context.

The architecture program split that concern across earlier slices:

- `T-108` completed the full canonical neutral-host foundation in PR `#1184`.
  `ida.*`, `IDA_HOST`, and `ida.localhost` resolve as public no-tenant contexts
  with a discriminated public result, no tenant cookie, and neutral public
  branding before session context resolves.
- `T-109` kept country hosts as compatibility aliases rather than new tenant
  routing authority.
- `T-114` established explicit IDA dashboard/auth E2E lanes for canonical role
  flows.
- `T-501` completed the flagged live-login cutover in PR `#1186`: country hosts
  redirect login to `ida.*`, carry only a default booking tenant hint, validate
  that hint server-side before email sign-in, and preserve member, agent, staff,
  and admin session continuity.

## Decision

`ida.*` is the canonical neutral front door for public and login entry. It must
not imply tenant identity, legal entity identity, access tenant scope, booking
tenant scope, or country-host branding before a valid session or explicitly
validated booking hint is present.

Country hosts remain compatibility aliases. Under the live-login cutover, a
country-host login request redirects to the matching `ida.*` host with
`default_booking_tenant_id` as a booking hint. The redirect must not set or
refresh a tenant cookie, and the country host must not become the live sign-in
authority while the cutover is enabled.

The server-side email sign-in guard owns tenant-hint validation. A redirected
IDA sign-in may use the default booking tenant hint only when it matches the
resolved user tenant. Invalid, missing, hostile, or country-host body hints fail
closed before better-auth handles the sign-in request.

Cookie and session precedence is:

1. An authenticated session determines tenant context for protected role flows.
2. A validated IDA booking tenant hint may select the sign-in tenant during the
   email sign-in request.
3. A country-host alias may provide compatibility/default-booking context only
   on alias routes and redirects.
4. Stale tenant cookies, stale session cookies, request headers, query strings,
   and lookalike hosts must not override IDA public context or a validated
   session.

Public `ida.*` pages render neutral no-tenant branding until session context is
known. Tenant logos, theme tokens, tenant chrome, and country-host identity must
not leak into the public IDA shell.

The `T-107` model-half closeout records the context model behind that runtime
contract: IDA is a public/no-tenant entry context. It is not an access tenant,
home tenant, legal tenant, booking tenant, recovery legal tenant, or country
host authority. Any later dashboard gate may consume the stabilized session
context that follows IDA login, but it must not treat public IDA host resolution
as tenant, entity-of-record, or recovery authority.

## Consequences

Positive:

- Public and login entry have a stable neutral authority independent of country
  host aliases.
- Country-host traffic can continue to help booking and locale selection without
  becoming tenant authentication authority.
- Stale-cookie and session-conflict behavior is explicit and testable.
- Later dashboard, layout consolidation, and entity/billing work can depend on
  IDA-first login semantics instead of host-derived tenant identity.

Negative:

- Country-host login links require redirect and hint plumbing during the live
  cutover.
- Future auth and routing changes must preserve both IDA neutrality and the
  server-side hint validation contract.

## Boundaries

This ADR records the accepted architecture proven by `T-108`, `T-501`, and the
`T-107` model closeout. It does not change runtime code, proxy behavior,
auth/session code, tenancy logic, schema, RLS, migrations, billing behavior,
Paddle integration, product UI, README, or AGENTS.

The test paths listed below are evidence landed by prior implementation PRs,
not new runtime or test scope for this ADR closeout.

`apps/web/src/proxy.ts` remains the sole routing, access-control, and tenant
isolation authority. Canonical routes remain `/member`, `/agent`, `/staff`, and
`/admin`; clarity markers remain contractual E2E signals.

## Related Work

- `docs/plans/architecture-finalization-program-2026-05-29.md`
- `docs/plans/architecture-finalization-tracker-2026-05-29.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `docs/plans/2026-06-24-t501-closeout-current-authority.md`
- `docs/plans/2026-06-24-obr-dg30-post-t501-next-authority.md`
- `docs/architecture/adr-01-tenant-decomposition.md`
- `apps/web/src/lib/proxy-front-door.test.ts`
- `apps/web/e2e/gate/front-door-session-context.spec.ts`
- `apps/web/e2e/gate/ida-live-login-cutover.spec.ts`
- `apps/web/src/app/api/auth/[...all]/_core.live-login-cutover.test.ts`
- `apps/web/src/app/api/auth/[...all]/route.live-login-cutover.test.ts`
