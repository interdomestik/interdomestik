# CSP Nonce Migration Design

Status: approved design gate  
Date: 2026-05-06  
Scope: design only; no runtime behavior changes in this slice

## Current CSP Inventory

The active production CSP is emitted from `apps/web/src/lib/proxy-logic.ts` by
`buildContentSecurityPolicy(request)` and attached by `createSecurityHeaders(request)`.

Current directives:

```text
default-src 'self';
script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://www.google-analytics.com https://cdn.paddle.com https://*.paddle.com [development: 'unsafe-eval'];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com;
font-src 'self' data:;
connect-src 'self' https://*.supabase.co https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://api.paddle.com https://*.paddle.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://graph.facebook.com;
frame-src 'self' https://*.paddle.com https://buy.paddle.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
[production HTTPS only: upgrade-insecure-requests]
```

The broader security header set already includes HSTS on production HTTPS requests,
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy,
and curated host allowlists for analytics, Sentry, Supabase, Paddle, and Meta/Facebook.

Remaining CSP issue: `script-src` and `style-src` both still allow `'unsafe-inline'`.
Production `script-src` already avoids `'unsafe-eval'`; development keeps it for tooling.

## Inline Script And Style Audit

Repo audit on 2026-05-06:

- `dangerouslySetInnerHTML`: zero matches.
- `styled-jsx`: no source usage. Only lockfile dependency entries appear.
- Inline GTM, Meta Pixel, PostHog, Paddle, and Sentry snippets: no source matches.
- Analytics source loading exists in `apps/web/src/components/analytics/analytics-scripts.tsx`
  through `next/script` for GTM and Meta Pixel external URLs.
- PostHog is initialized through the `posthog-js` package in a client provider.
- Paddle is initialized through `@paddle/paddle-js`.
- Sentry is initialized through `@sentry/nextjs` config files, not inline snippets.

Known framework/runtime sources to verify during implementation:

- Next.js framework scripts.
- React Server Component streaming payload scripts.
- `next/font` generated style behavior.
- Possible Sentry replay or feedback injected styles if replay/feedback is enabled later.
- GTM custom HTML tags, which can reintroduce inline script or style execution outside
  repository review.

The inline-script surface is unusually clean for a nonce migration. If this audit remains
true, the implementation slice is likely 200-400 lines, mostly proxy/header plumbing,
root-layout nonce propagation, tests, and report handling.

## Migration Plan

### Phase 0: Report-Only Nonce Policy

Add `CSP_NONCE_MODE=off|report|enforce` and start with `CSP_NONCE_MODE=report`.

Behavior:

- Keep the current enforced `Content-Security-Policy` unchanged.
- Add a nonce CSP in `Content-Security-Policy-Report-Only`.
- Include both `report-to` and `report-uri`.
- Observe Sentry/report data for 14 days before enforcement.

The local report endpoint is intentionally not implemented in this design-gate PR. The
smallest implementation artifact for Phase 0 can be either:

- Direct browser report delivery to Sentry, if Sentry project ingestion supports the
  desired CSP report format.
- `apps/web/src/app/api/csp-report/route.ts`, accepting CSP reports, capturing them to
  Sentry as warnings, and optionally storing append-only `csp_violations` later.

If the local endpoint path is chosen later, it needs focused route tests and coverage-gate
verification in that implementation slice.

### Phase 1: Enforce Script Nonces

Set `CSP_NONCE_MODE=enforce` after Phase 0 acceptance criteria pass.

Behavior:

- Emit the nonce policy in `Content-Security-Policy`.
- Remove `'unsafe-inline'` from `script-src`.
- Keep production `'unsafe-eval'` absent.
- Keep development `'unsafe-eval'` only while Next.js/tooling requires it.

### Phase 2: Evaluate Style Nonces Separately

Do not remove `'unsafe-inline'` from `style-src` in the same enforcement step unless
built-artifact and browser verification prove it safe.

Behavior:

- Prefer `style-src 'self' 'nonce-{NONCE}'` if Next.js, `next/font`, React streaming,
  Paddle overlays, and Sentry injected styles are clean.
- Keep `style-src 'unsafe-inline'` only if `next/font`, streaming, Paddle, Sentry, or
  another runtime integration still requires it.
- Record the exact source of any remaining inline style need before accepting it.

### Phase 3: Revisit Development Unsafe Eval

Development currently allows `'unsafe-eval'` for tooling. Revisit it once the Next.js
development toolchain supports local iteration without that allowance.

## CSP Model

Use a nonce plus `'strict-dynamic'`, not a nonce alone.

Proposed production `script-src` shape:

```text
script-src 'self' 'nonce-{NONCE}' 'strict-dynamic' https:
```

Rationale:

- The nonce authorizes framework and explicitly trusted bootstrap scripts.
- `'strict-dynamic'` lets nonce-authorized scripts load their dependent scripts without
  needing every descendant URL to be enumerated.
- The trailing `https:` is a compatibility fallback for browsers that do not understand
  `'strict-dynamic'`; modern browsers that honor `'strict-dynamic'` ignore host allowlists
  for script trust decisions.
- `connect-src` and `frame-src` host allowlists remain explicit because they govern network
  and embedding destinations, not script trust inheritance.

The nonce policy must preserve required hosts for Supabase, Sentry, PostHog, Google
Analytics/GTM, Meta/Facebook, and Paddle in the directives where those hosts still matter.

## Next.js Nonce Wiring

Next.js 16.2 CSP guidance documents the proxy-generated nonce pattern:

1. Generate a fresh per-request nonce in proxy logic.
2. Build the nonce CSP with `'nonce-{NONCE}'` and `'strict-dynamic'`.
3. Clone request headers with `new Headers(request.headers)`.
4. Set `x-nonce` on the cloned request headers.
5. Set the CSP value on the cloned request headers so Next.js can discover the nonce.
6. Return `NextResponse.next({ request: { headers } })` for pass-through responses.
7. Emit the CSP response header with the same nonce.
8. Read `x-nonce` in the root layout using `headers()` from `next/headers`.
9. Pass the nonce to any custom inline `Script` if introduced later.

This repo has additional response paths, including auth redirects. The implementation must
preserve the existing `applyResponseHardening` flow and ensure redirects and pass-through
responses emit the same CSP model for their mode.

Next.js framework nonce behavior is expected to cover framework scripts when the nonce is
available in request headers, but the implementation must verify built artifacts and browser
HTML. Required proof:

- Production build or production-like local run.
- HTML contains framework script tags with a nonce matching the CSP.
- Browser navigation works for public and protected-route redirect responses.
- Two independent requests receive different nonces.

Nonce generation forces request-specific HTML. The implementation must explicitly assess
dynamic rendering and edge-cache behavior before enforcement.

## Report Handling

The nonce policy should include both reporting mechanisms:

```text
report-to csp-endpoint
report-uri /api/csp-report
```

Suggested `Report-To` value:

```json
{ "group": "csp-endpoint", "max_age": 10886400, "endpoints": [{ "url": "/api/csp-report" }] }
```

If routing reports directly to Sentry, document the exact Sentry endpoint and accepted report
format in the Phase 0 implementation PR.

If using `apps/web/src/app/api/csp-report/route.ts`:

- Accept `application/csp-report`, `application/reports+json`, and JSON bodies defensively.
- Normalize the violated directive, blocked URI, document URI, disposition, source file,
  line number, and user agent.
- Capture normalized violations to Sentry as warning-level events.
- Avoid storing request cookies, authorization headers, or full query strings.
- Optionally add append-only `csp_violations` storage later, in a separate schema-reviewed
  slice.

## Feature Flag

`CSP_NONCE_MODE=off|report|enforce`

- `off`: current enforced policy only.
- `report`: current enforced policy plus nonce policy in
  `Content-Security-Policy-Report-Only`.
- `enforce`: nonce policy enforced in `Content-Security-Policy`.

Rollback is an environment flag toggle:

- From `enforce` to `report` if violations appear after rollout.
- From `report` to `off` if Report-Only volume is noisy or harmful.

No database rollback is involved unless a later optional `csp_violations` table is added.

## Risk Assessment

- Paddle sandbox checkout overlay: Paddle may inject scripts, frames, or styles needed for
  checkout. Add a sandbox checkout test before script enforcement.
- GTM custom HTML tags: operations must not publish custom HTML tags that depend on inline
  script/style execution unless the tag has been reviewed for nonce compatibility.
- Sentry replay/injected styles: replay or feedback features may inject style elements.
  Keep style enforcement separate and verify with the exact enabled Sentry features.
- Meta Pixel: current repo loads the external Pixel script through `next/script`, but runtime
  behavior must be verified after nonce propagation.
- PostHog: package initialization may load network resources from the configured PostHog
  host; keep `connect-src` allowlists and verify no inline snippet path is introduced.
- `next/font`: generated font styles may require style nonce support or a temporary
  `style-src 'unsafe-inline'` allowance.
- React streaming: RSC streaming can emit framework-managed script payloads that must carry
  the nonce in production-like HTML.
- Edge-cache impact: per-request nonces can prevent static HTML reuse. The implementation
  must confirm which routes become dynamic and whether that is acceptable for the pilot.

## Test Plan For Implementation Phases

Update `apps/web/e2e/security/headers.spec.ts` later to assert:

- `script-src` contains a nonce.
- `script-src` contains `'strict-dynamic'`.
- `script-src` lacks `'unsafe-inline'` in enforce mode.
- `script-src` lacks `'unsafe-eval'` outside development.
- HTML contains at least one script nonce matching CSP.
- Two requests receive different nonces.

Add before enforcement:

- Paddle sandbox checkout test proving the checkout overlay opens and completes the expected
  sandbox path under the nonce policy.
- Sentry/report observation criteria showing no medium-or-higher actionable violations over
  the 14-day Report-Only window.
- Focused proxy/header unit tests for `off`, `report`, and `enforce` behavior.
- If a local report endpoint is implemented, focused route tests for accepted formats,
  payload normalization, PII minimization, and warning-level Sentry capture.

## Acceptance Criteria

- Zero CSP violations of severity medium or higher in Sentry over a 14-day Report-Only
  observation window before enforcement.
- Paddle sandbox checkout passes under the report policy before enforcement.
- Security headers spec proves nonce propagation and nonce freshness.
- Rollback is tested by switching `CSP_NONCE_MODE` back to `off` or `report`.
- Production-like browser verification proves framework script nonces match the CSP.

## Out Of Scope

- No `apps/web/src/proxy.ts` edits.
- No `next.config.mjs` edits.
- No analytics script rewrites.
- No Sentry tunnel route rewrites.
- No auth, tenancy, routing, canonical route, schema, Stripe, or product runtime behavior
  changes.
- No new package.
- No product UX changes.
- No Phase 0 report endpoint in this design-gate PR.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth, tenancy, routing, domain architecture, schema, and Stripe remain untouched.
- This design uses Paddle only as an existing V3 pilot risk to verify; it does not add
  Stripe or alter billing behavior.
