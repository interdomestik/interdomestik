# Staff Auth Production Hardening Design

## Goal

Harden the canonical staff auth/session flow after the merged staff dashboard fix by adding targeted telemetry, reducing avoidable session churn, introducing a production-gated staff synthetic in the existing release path, and putting any additional auth-guard tolerance behind a tenant-scoped flag.

## Scope

Included:

- runtime behavior around staff post-login redirect and protected-route bounce handling
- low-cardinality telemetry for auth/session failure modes
- browser/E2E session-probe reduction in the authenticated path
- one staff synthetic in the existing release-gate path
- tenant-scoped rollout control for additional auth-guard tolerance

Explicitly excluded:

- infra changes
- `apps/web/src/proxy.ts`
- routing/auth/tenancy refactors
- new auth providers or session storage redesign
- broad telemetry platform work outside the existing app and release-gate surface

## User Need

The recent fix removed the observed staff login bounce and stabilized queue/detail navigation, but the next production-hardening step is different in character:

- detect when post-login handoff still degrades in the wild
- detect when a protected route bounces back to login after a recent successful auth
- avoid generating avoidable auth/session probes in the browser path
- verify the exact staff login -> queue -> detail -> refresh flow in the release path
- keep any extra auth tolerance narrowly scoped by tenant

The goal is measurable reliability, not broader auth redesign.

## Current State

The current runtime has three relevant seams:

1. [proxy-logic.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/proxy-logic.ts)

- protects canonical top-level routes
- validates the signed session cookie
- treats `429` session introspection as transient `unknown`
- redirects to `/{locale}/login` on missing cookie, invalid cookie, or inactive session

2. [session.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/components/shell/session.ts)

- deduplicates server-side `getSession` calls per request signature
- caches successful session reads briefly
- retries only when a request carries an auth hint

3. [auth.fixture.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/e2e/fixtures/auth.fixture.ts)

- proves authenticated readiness with role-specific markers
- still performs a post-auth session probe that can hit throttling

The release path already has a production-like auth/navigation harness in:

- [scripts/release-gate/run.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/run.ts)
- [scripts/release-gate/shared.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/shared.ts)
- [scripts/release-gate/session-navigation.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/session-navigation.ts)
- [scripts/release-gate/product-checks.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/product-checks.ts)

## Recommended Architecture

Keep the implementation as one PR, but split the work internally into four bounded units:

1. Auth telemetry utility
2. Runtime guard/session hardening
3. Browser probe reduction
4. Release-gate staff synthetic

Each unit should be independently understandable and testable. None should require changing the routing authority or auth system layering.

## Design

### 1. Auth Telemetry Utility

Add a small auth telemetry helper under `apps/web/src/lib/` that normalizes auth telemetry payloads and emits them as structured JSON logs through `console.info`.

This is intentionally a log-first sink, not a new telemetry platform integration. It keeps the implementation usable from:

- client code
- edge/runtime code
- release-gate Node scripts

The helper should export:

- a payload normalizer
- an `emitAuthTelemetryEvent(event)` function that writes one structured line to `console.info`

Serialization contract:

- `console.info(JSON.stringify(payload))`
- top-level `event_type` must be exactly `auth_telemetry`
- top-level `event_name` must be one of the required event names
- top-level `occurred_at` must be an ISO-8601 timestamp string
- all other fields must be flat scalar values or omitted
- no nested raw request/session objects

Responsibilities:

- build normalized auth event payloads
- sanitize route and host metadata
- emit structured events without PII or secrets

Required events:

- `staff_post_login_redirect_failed`
- `protected_route_bounce_to_login`
- `session_introspection_throttled`
- `session_probe_skipped_after_ready`

Required fields:

- `tenant`
- `locale`
- `surface`
  - one of `staff`, `member`, `admin`, `agent`, `unknown`
- `host_class`
  - one of `nipio`, `canonical`, `localhost`, `other`
- `reason`
  - one of `missing_cookie`, `invalid_cookie`, `inactive_session`, `throttled`, `post_login_sync_timeout`, `ready_probe_skipped`
- `pathname_family`
  - normalized route family only, not full unbounded user input

Forbidden fields:

- raw cookie values
- authorization headers
- email addresses
- free-form callback URLs

Event contract:

| Event                               | Source            | Sink                      | Trigger                                                                                                                 |
| ----------------------------------- | ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `staff_post_login_redirect_failed`  | `login-form.tsx`  | structured `console.info` | sign-in succeeded but no supported canonical redirect target was resolved                                               |
| `protected_route_bounce_to_login`   | `proxy-logic.ts`  | structured `console.info` | protected route redirects to login due to missing cookie, invalid cookie, or confirmed inactive session                 |
| `session_introspection_throttled`   | `proxy-logic.ts`  | structured `console.info` | session introspection returns `429` or transient rate-limit state                                                       |
| `session_probe_skipped_after_ready` | `auth.fixture.ts` | structured `console.info` | authenticated readiness markers already proved the page state, so the post-auth session probe was intentionally skipped |

Deterministic reason codes:

- `missing_cookie`
- `invalid_cookie`
- `inactive_session`
- `throttled`
- `post_login_sync_timeout`
- `unsupported_redirect_target`
- `ready_probe_skipped`

Example payload:

```json
{
  "event_type": "auth_telemetry",
  "event_name": "protected_route_bounce_to_login",
  "occurred_at": "2026-03-25T21:00:00.000Z",
  "tenant": "tenant_ks",
  "locale": "sq",
  "surface": "staff",
  "host_class": "nipio",
  "reason": "inactive_session",
  "pathname_family": "/staff/claims"
}
```

`pathname_family` normalization rule:

- use only the canonical top-level protected route and one stable child segment when relevant
- examples:
  - `/sq/login` -> `/login`
  - `/sq/staff/claims` -> `/staff/claims`
  - `/sq/staff/claims/pack_ks_claim_123` -> `/staff/claims`
  - `/sq/admin/users/123` -> `/admin/users`

### 2. Runtime Guard Hardening

Keep [proxy-logic.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/proxy-logic.ts) as the runtime behavior surface, without touching `apps/web/src/proxy.ts`.

Add one tenant-scoped feature flag in [feature-flags.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/feature-flags.ts) for extra auth-guard tolerance.

Proposed flag:

- `STAFF_AUTH_TOLERANT_TENANTS`

Behavior:

- comma-separated tenant ids, for example `tenant_ks,pilot-mk`
- parsed once per request using normalized lowercase values
- applies only when a protected-route request already has a present, signed-valid session cookie
- does not alter missing-cookie or invalid-signed-cookie behavior
- does not convert explicit `inactive` into authenticated access without a retry

Runtime rule:

- current default logic remains unchanged for tenants not listed
- for unflagged tenants:
  - `active` -> allow
  - `inactive` -> redirect to login
  - `unknown` -> allow and emit telemetry only when throttled
- for flagged tenants:
  - `active` -> allow
  - `inactive` on the first introspection attempt -> retry introspection once before redirecting
  - second `inactive` -> redirect to login
  - `unknown` on the first introspection attempt -> allow immediately and emit `session_introspection_throttled` before returning

Retry/emit order:

- emit `session_introspection_throttled` immediately when the introspection result is `unknown` because of `429` or another transient failure
- do not retry after `unknown`
- retry only after a first `inactive` result on a flagged tenant with a signed-valid cookie
- if the retry after a first `inactive` returns `unknown`, allow and keep the request on the protected route
- if the auth secret is absent and signed-cookie validation cannot run, the tenant-scoped tolerance path is disabled and behavior falls back to the current unflagged logic

This is the only additional tolerance in scope: a single retry before redirect for flagged tenants that already presented a signed-valid session cookie.

This keeps the feature flag as a rollout control, not a second auth system.

### 3. Post-Login Redirect Failure Telemetry

In [login-form.tsx](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/components/auth/login-form.tsx), keep the current role sync + hard redirect behavior.

Add telemetry only for the failure path where:

- sign-in succeeds
- no supported authenticated role is visible after the retry window
- or a canonical route cannot be derived from the resolved role

This event should not block the current UX beyond the already-existing error handling.

### 4. Protected-Route Bounce Telemetry

In [proxy-logic.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/proxy-logic.ts), emit `protected_route_bounce_to_login` when a request to a protected route is redirected to login because of:

- missing cookie
- invalid signed cookie
- explicit inactive session

Also emit `session_introspection_throttled` when introspection returns `429` or equivalent transient failure.

The event should describe the reason code and normalized route family, but should not record the raw target URL.

### 5. Browser Session-Probe Reduction

In [auth.fixture.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/e2e/fixtures/auth.fixture.ts) and [auth.actions.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/e2e/fixtures/auth.actions.ts), reduce unnecessary session probing after authenticated readiness is already proven.

Required behavior:

- if role-specific readiness markers are visible after login/navigation, do not run the post-auth `/api/auth/get-session` probe
- the only allowed post-auth probe call sites are the final validation steps inside `ensureAuthenticated` in those two fixture files
- setup-state generation may still use those final validation steps through `ensureAuthenticated`
- explicit validation mode is invoked only when `ensureAuthenticated` is called for login/setup flows that have not yet proven readiness markers
- if a probe is skipped because readiness already proved authenticated state, emit `session_probe_skipped_after_ready`
- still fail hard on `401` or `403` when a probe is explicitly performed

This change should reduce `429` churn without weakening gate confidence.

Probe inventory:

| File                                    | Current use                        | In scope                      |
| --------------------------------------- | ---------------------------------- | ----------------------------- |
| `apps/web/e2e/fixtures/auth.fixture.ts` | authenticated bootstrap validation | yes                           |
| `apps/web/e2e/fixtures/auth.actions.ts` | authenticated bootstrap validation | yes                           |
| `apps/web/e2e/api-permissions.spec.ts`  | explicit session/API assertions    | no, keep as direct assertions |
| `apps/web/e2e/rbac-isolation.spec.ts`   | explicit debug/security assertions | no, keep as direct assertions |

### 6. Release-Gate Staff Synthetic

Add one production-gated synthetic staff auth/session check to the existing release path.

Target flow:

1. log in as canonical Kosovo staff
2. land on `/sq/staff/claims`
3. verify the queue/list surface is ready
4. open a deterministic staff claim detail
5. refresh on detail
6. verify the detail surface is still ready
7. verify there is no bounce to `/sq/login`

Implementation should extend the existing release-gate scripts rather than adding a parallel harness.

Deterministic detail-route derivation order:

1. use `STAFF_CLAIM_URL` if configured and it resolves to a staff claim detail route
2. otherwise use existing list discovery via `collectStaffClaimDetailUrls`
3. otherwise fall back to the existing deterministic default constant in `product-checks.ts`
4. if none of those yield a detail route, fail the synthetic with explicit evidence

Configured `STAFF_CLAIM_URL` classification rules:

- accept absolute URLs and relative paths
- normalize locale-prefixed and locale-less paths to the run context base URL before classification
- reject cross-origin absolute URLs before fallback
- strip query strings and fragments before path-shape classification
- trim trailing slashes before distinguishing list vs detail
- treat `/staff/claims` and `/{locale}/staff/claims` as list routes, not detail routes
- treat only `/staff/claims/{id}` and `/{locale}/staff/claims/{id}` as valid detail routes
- any other configured staff URL shape must be rejected and logged as invalid configured detail input before fallback

Likely touchpoints:

- [scripts/release-gate/run.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/run.ts)
- [scripts/release-gate/product-checks.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/product-checks.ts)
- [scripts/release-gate/session-navigation.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/session-navigation.ts)
- [scripts/release-gate/shared.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/shared.ts)

The check should be enabled only in the production-like release path, not as a permanent developer slowdown for every local test command.

## File Plan

Modify:

- [apps/web/src/lib/proxy-logic.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/proxy-logic.ts)
- [apps/web/src/lib/feature-flags.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/feature-flags.ts)
- [apps/web/src/components/auth/login-form.tsx](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/components/auth/login-form.tsx)
- [apps/web/e2e/fixtures/auth.fixture.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/e2e/fixtures/auth.fixture.ts)
- [apps/web/e2e/fixtures/auth.actions.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/e2e/fixtures/auth.actions.ts)
- [scripts/release-gate/run.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/run.ts)
- [scripts/release-gate/product-checks.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/product-checks.ts)
- [scripts/release-gate/session-navigation.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/session-navigation.ts)
- [scripts/release-gate/shared.ts](/Users/arbenlila/development/interdomestik-crystal-home/scripts/release-gate/shared.ts)

Create:

- [apps/web/src/lib/auth-telemetry.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/auth-telemetry.ts)
- [apps/web/src/lib/auth-telemetry.test.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/auth-telemetry.test.ts)
- [apps/web/src/lib/feature-flags.test.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/feature-flags.test.ts)
- [apps/web/src/lib/proxy-logic.test.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/lib/proxy-logic.test.ts)
- [apps/web/src/components/auth/login-form.test.tsx](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/src/components/auth/login-form.test.tsx)
- [apps/web/e2e/fixtures/auth.fixture.test.ts](/Users/arbenlila/development/interdomestik-crystal-home/apps/web/e2e/fixtures/auth.fixture.test.ts)
- release-gate coverage in the existing test file(s) that assert release-gate session/product checks

## Error Handling

The hardening pass must fail safely:

- if telemetry emission fails, auth behavior continues unchanged
- if the tenant-scoped flag is absent or malformed, default to disabled
- if the release-gate synthetic cannot derive a deterministic detail route, it should fail with specific evidence rather than silently skipping
- if session probing is skipped after readiness, the skip must be explicit and traceable in logs/telemetry

## Verification

Required verification:

- targeted unit tests for:
  - feature-flag parsing
  - proxy telemetry emission
  - login-form redirect-failure telemetry
  - auth fixture probe-reduction behavior
- targeted staff Playwright specs on the canonical host
- release-gate synthetic execution through the existing release path
- mandatory repo verification:
  - `pnpm pr:verify`
  - `pnpm security:guard`
  - `pnpm e2e:gate`

## Trade-Offs Considered

### Option 1: Broad auth telemetry everywhere

Rejected for this pass. It would spread changes across too many surfaces and blur the review goal.

### Option 2: No feature flag, always-on extra tolerance

Rejected. Production hardening should be measurable and reversible per tenant.

### Option 3: Separate synthetic Playwright suite outside the release gate

Rejected. The existing release path already owns production-like navigation checks, so the synthetic should extend that path instead of creating a second source of truth.

## Deliverable

One PR that:

- adds low-cardinality staff auth telemetry
- adds tenant-scoped auth-guard tolerance control
- reduces avoidable authenticated browser session probing
- adds a production-gated staff auth/session synthetic to the release path
- keeps all changes inside the current staff/auth/release-gate surface without touching infra or `apps/web/src/proxy.ts`
