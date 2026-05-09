# CSP Nonce Migration Design

Status: approved design gate, updated after Phase 0 implementation
Date: 2026-05-06; post-Phase-0 update 2026-05-08
Last reviewed: 2026-05-09
Scope: design history plus active post-Phase-0 investigation protocol

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

Historical plan, superseded by the DG07 production posture below.

Add `CSP_NONCE_MODE=off|report|enforce`. The original Phase 0 plan intended a continuous
report-mode observation window, but DG07 now sets production default to `CSP_NONCE_MODE=off`
and allows report mode only for bounded diagnostic windows with explicit budget controls.

Behavior:

- Keep the current enforced `Content-Security-Policy` unchanged.
- Add a nonce CSP in `Content-Security-Policy-Report-Only`.
- Include both `report-to` and `report-uri`.
- Historical only: the original plan observed Sentry/report data for 14 days before
  enforcement. DG07 now requires an explicit bounded diagnostic window before report mode is
  enabled.

Phase 0 implemented the local report endpoint path in
`apps/web/src/app/api/csp-report/route.ts`, accepting CSP reports, capturing them to
Sentry as warnings, and avoiding durable CSP report storage. Direct browser report delivery
to a Sentry ingest endpoint is no longer the active Phase 0 path.

### Phase 1: Enforce Script Nonces

Blocked by DG07 until one of the DG07 unlock conditions is met.

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

### P33-SEC05 Next CSP Nonce Propagation Triage Update

SEC05 classified the SEC03 blocker as a report-only architecture mismatch with the current
two-header Phase 0 model, not as an upstream Next.js nonce bug and not as a product wiring gap
by itself.

Minimal Next `16.2.4` evidence shows:

- the documented baseline works when a nonce-bearing `Content-Security-Policy` is present;
- Report-Only-only can also nonce framework scripts when no enforced CSP header is present;
- the repo-shaped Phase 0 model fails when the response includes the existing non-nonce
  enforced `Content-Security-Policy` beside a nonce-bearing
  `Content-Security-Policy-Report-Only`.

Installed Next source explains the result: App Router request-header parsing chooses
`content-security-policy` before `content-security-policy-report-only` when extracting the
script nonce. If the enforced CSP exists and has no nonce, Next does not fall through to the
nonce-bearing Report-Only header.

Current consequence: SEC03 should not be retried as a framework-script nonce fix while the
enforced CSP header must remain unchanged. CSP Phase 1 remains blocked, and the next safe
step is a design gate for migration architecture rather than an implementation slice that
rewrites HTML, monkey-patches Next, weakens Report-Only CSP, or hides first-party reports.

### P33-DG07 Architecture Rebaseline

DG07 records the CSP nonce migration architecture rebaseline after SEC05.

The active blocker is architectural: the current Phase 0 shape keeps the existing non-nonce
`Content-Security-Policy` response header and adds a nonce-bearing
`Content-Security-Policy-Report-Only` header. Next.js `16.2.4` chooses the enforced CSP
header before the Report-Only header when extracting the App Router script nonce, so
first-party framework/static scripts remain unnonced in this model.

Pinned source receipt:

- `apps/web/package.json` declares `next` as `^16.2.4`.
- `pnpm-lock.yaml` resolves the web app dependency to `next@16.2.4` with integrity
  `sha512-kPvz56wF5frc+FxlHI5qnklCzbq53HTwORaWBGdT0vNoKh1Aya9XC8aPauH4NJxqtzbWsS5mAbctm4cr+EkQ2Q==`.
- The installed package reports version `16.2.4` and no exposed npm `gitHead`.
- `apps/web/node_modules/next/dist/esm/server/app-render/app-render.js` contains:

```js
const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
const nonce = typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined;
```

DG07 sets the Phase 0 production posture to **available but default off**:
`CSP_NONCE_MODE=off` is the intended production state unless a later bounded diagnostic
window explicitly enables `report`. Phase 0 code remains in place as a future hook:

- `apps/web/src/lib/proxy-logic.ts`
- `apps/web/src/lib/security/csp-nonce.ts`
- `apps/web/src/app/api/csp-report/route.ts`
- `apps/web/src/app/[locale]/_core.entry.tsx`
- `apps/web/src/components/analytics/analytics-scripts.tsx`

Sentry receipt on 2026-05-09 from the configured project
`human-p5/interdmestik-nextjs`:

```text
statsPeriod=7d
query="csp.first_party:true csp.directive:[script-src,script-src-elem,script-src-attr]"
total=0 events; 7-day average=0/day
```

This is not proof that the policy is clean. It means continuous production reporting is not
currently producing first-party script-family signal, which supports keeping report mode off
by default rather than spending ongoing report and dynamic-rendering budget.

Any future report-mode diagnostic window must name duration, traffic scope,
route-table/cache receipts, Sentry event budget or cap for `csp.violation` warnings,
rollback threshold, and the owner responsible for returning production to
`CSP_NONCE_MODE=off`.

SEC03 is now `blocked-by-architecture`: it should not be retried under the current two-header
Phase 0 model. SEC05 remains completed evidence because it delivered the classification.

CSP nonce enforcement migration can resume only after a later gate records one of these
conditions:

1. Next.js documents or ships a supported hook that lets apps choose a nonce-bearing
   Report-Only policy when an enforced CSP is also present.
2. A Next.js version change, including patch, minor, major, lockfile-only refresh, or
   dependency-range change, changes nonce extraction behavior, and an automated SEC05-adjacent
   reproduction plus product smoke proves the current two-header model now nonces first-party
   framework scripts.
3. The program explicitly approves changing the enforced CSP architecture before Phase 1,
   with browser semantics, route performance, rollback, and production-risk evidence.
4. A separate non-production preview harness is approved to test true nonce-enforced CSP
   behavior without changing production defaults or unguarding `CSP_NONCE_MODE=enforce`.
5. The program promotes a different long-term CSP architecture, such as Trusted Types,
   tightened SRI, or accepting `'unsafe-inline'` with explicit compensating controls, and
   explicitly retires the nonce-migration target.

Review cadence: DG07's unlock conditions are reviewed at every Next.js version change,
including patch, minor, major, lockfile-only refresh, or dependency-range change, and at
minimum every six months. If no condition has triggered by the six-month review, the program
must decide whether to retire Phase 0 wiring, pivot to a non-nonce CSP architecture, or renew
the wait with a new evidence basis.

## Report Handling

The nonce policy should include both reporting mechanisms:

```text
report-to csp-endpoint
report-uri /api/csp-report
```

Suggested `Report-To` value:

```json
{ "group": "csp-endpoint", "max_age": 86400, "endpoints": [{ "url": "/api/csp-report" }] }
```

If routing reports directly to Sentry, document the exact Sentry endpoint and accepted report
format in the Phase 0 implementation PR.

If using `apps/web/src/app/api/csp-report/route.ts`:

- Accept `application/csp-report` and `application/reports+json`; reject other content types.
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
- Sentry/report observation criteria matching the post-Phase-0 promotion bar below.
- Focused proxy/header unit tests for `off`, `report`, and `enforce` behavior.
- If a local report endpoint is implemented, focused route tests for accepted formats,
  payload normalization, PII minimization, and warning-level Sentry capture.

## Acceptance Criteria

Phase 0 implementation criteria are complete through `P33-SEC02`. Phase 1 enforcement must
use the stricter post-Phase-0 promotion bar below, not the older qualitative "zero
medium-or-higher violations" criterion. Extension noise, third-party chains, unknown hosts,
and first-party script-family reports must be triaged through the DG04 taxonomy before any
enforcement decision.

## Post-Phase-0 Investigation Protocol

`P33-SEC02 CSP Nonce Phase 0 Report-Only` shipped the report-only nonce path and
showed that first-party `script-src` reports still exist. Phase 1 enforcement is
therefore blocked until `P33-DG04 CSP First-Party Script Nonce Coverage Design
Review` confirms the root cause and defines the smallest fix.

DG04 must test this prioritized hypothesis tree:

| Hypothesis                                | Description                                                                                                                                                                                | Required check                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| H1 - Next framework scripts               | React DOM bootstrap and RSC streaming flush emit inline `<script>` tags. They get nonces only if the CSP request header contains a nonce token and `x-nonce` is on cloned request headers. | Verify request-header propagation, response CSP shape, and captured HTML framework script nonce coverage. |
| H2 - `next/script` nonce props            | Analytics scripts receive `nonce={cspNonce}` from the root layout, but every internal `<Script>` must consume it.                                                                          | Verify GTM and Meta Pixel script tags when env IDs are configured.                                        |
| H3 - Sentry client boot script            | Sentry client instrumentation may inject an inline boot script.                                                                                                                            | Correlate reports with `instrumentation-client.ts` and Sentry client artifacts.                           |
| H4 - Third-party runtime-injected scripts | Paddle, GTM, Pixel, or Sentry replay may load descendant scripts.                                                                                                                          | Verify `'strict-dynamic'` and group reports by third-party host.                                          |
| H5 - Browser extension noise              | Password managers or extensions can emit extension-scheme reports.                                                                                                                         | Classify extension reports as noise and do not block Phase 1.                                             |

The first DG04 measurement is the SEC02 canary probe:
`<script data-csp-nonce-probe nonce={cspNonce} />`. If the probe appears in CSP
reports, nonce propagation is broken end-to-end. If it does not, hand-authored
script nonce propagation works and the likely causes are framework,
instrumentation, or runtime-injected scripts.

DG04 evidence must come from Sentry events in the script directive family
(`csp.directive=script-src`, `script-src-elem`, or `script-src-attr`, or the
equivalent `csp.directive:script-src*` search) over a 48-72 hour staging window,
or from local report-mode smoke across at least six representative flows if
staging data is unavailable. Required flows: landing `/`, login, register,
member dashboard, claim wizard step 1, pricing, and agent home, across each
supported pilot tenant when feasible. Keep the raw directive token visible in
the table even if a later fix slice adds normalized directive-family tags.

DG04 appended the first violation table on 2026-05-08:

| directive               | blocked_host                  | document_host       | count                                            | category        | hypothesis | proposed fix                                                                                          |
| ----------------------- | ----------------------------- | ------------------- | ------------------------------------------------ | --------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| script directive family | inline                        | ks.127.0.0.1.nip.io | 89 SEC02; 117 DG04 local public-flow DOM samples | first-party     | H1         | `P33-SEC03` must nonce framework and runtime inline scripts in report mode, then rerun browser smoke. |
| script directive family | ks.127.0.0.1.nip.io           | ks.127.0.0.1.nip.io | 59 SEC02; 94 DG04 local public-flow DOM samples  | first-party     | H1         | `P33-SEC03` must nonce first-party Next static chunk script tags in report mode.                      |
| script directive family | third-party allowlisted hosts | unknown locally     | 0 confirmed in DG04                              | third-party     | H4         | Recheck GTM, Pixel, Paddle, and Sentry replay after H1 is fixed and IDs are configured.               |
| script directive family | extension schemes             | unknown locally     | 0 observed locally                               | extension/noise | H5         | Keep as non-blocking taxonomy category and document any future Sentry examples.                       |

DG04 used SEC02 PR evidence plus local report-mode browser diagnostics because Sentry event
query tooling was unavailable in this runtime. The local diagnostic confirmed that the
report-only nonce header and `strict-dynamic` were present while first-party
`/_next/static/chunks/*` script tags and framework/runtime inline scripts rendered without
nonce attributes. The `data-csp-nonce-probe` canary matched on landing, pricing, and login,
which proves the hand-authored nonce path is not globally broken; register showed a
route-specific canary mismatch that the follow-up fix slice must recheck.

DG04's local fallback smoke covered four public KS flows: landing, pricing, login, and
register. It did not cover the full fallback matrix from the protocol above. Authenticated
member dashboard, claim wizard step 1, agent home, and cross-tenant authenticated samples
were skipped because Sentry event query tooling was unavailable, Playwright MCP was blocked,
and no authenticated storage-state setup was available for the local fallback probe. The
missing flows remain required `P33-SEC03` follow-up evidence before Phase 1 promotion.

SEC03 implementation probe on 2026-05-08 confirmed an additional constraint: Next.js 16.2.4
and a patch probe on 16.2.6 did not apply nonce attributes to App Router framework/static
scripts in the standalone report-only path, even though the proxy emitted
`x-middleware-request-content-security-policy`, the response emitted a matching
`Content-Security-Policy-Report-Only`, and the root-layout canary script carried the
response `x-nonce`. A `NextResponse.rewrite(..., { request: { headers } })` probe broke
normal page readiness and was rejected. Until a supported Next.js hook or framework fix is
identified, SEC03 must not claim framework nonce coverage as fixed; it should at minimum
pin first-party CSP classification and keep Phase 1 blocked.

DG04 outcomes:

- H1 - Next framework scripts: confirmed.
- H2 - `next/script` nonce props: eliminated for repo-owned analytics components because GTM
  and Meta Pixel `Script` tags consume the root-layout nonce.
- H3 - Sentry client boot script: not confirmed by local public smoke.
- H4 - third-party runtime-injected scripts: not confirmed locally; analytics IDs and Paddle
  checkout still need post-H1 smoke.
- H5 - browser extension noise: not observed locally.

DG04 originally promoted `P33-SEC03 First-Party Script Nonce Coverage` as the smallest safe
fix slice. DG07 supersedes that sequencing after SEC05: SEC03 is semantically
`blocked-by-architecture` under the current two-header Phase 0 model. Phase 1 enforcement
remains blocked until a later gate records one of DG07's unlock conditions and then reruns
the promotion bar below against the accepted future architecture.

Use this taxonomy:

- First-party blocking: `blocked-uri = 'inline'` or blocked host equals
  document host. Must fix before Phase 1.
- Third-party allowlisted host: blocked host is in the intended script surface,
  such as Paddle, GTM, Pixel, or Sentry. Should be zero with `'strict-dynamic'`;
  non-zero implies a wiring gap.
- Browser extension: `chrome-extension://`, `moz-extension://`, or
  `safari-web-extension://`. Document as noise; do not block Phase 1.
- Random or unknown host: neither own-origin, allowlisted, nor extension. Triage
  manually before promotion.

The historical Phase 1 promotion bar is dormant until DG07 unlocks the CSP path. After an
unlock, Phase 1 promotion still requires all six checks against the accepted future
architecture:

1. 14 consecutive days of report-only data with zero first-party script
   directive-family violations after taxonomy triage.
2. Chrome, Firefox, and Safari report-mode smoke shows zero new first-party
   violations, or skipped browsers are documented with a concrete blocker.
3. `data-csp-nonce-probe` has a matching nonce in every captured report-mode
   HTML sample.
4. All E2E gate specs pass when `CSP_NONCE_MODE=enforce` is flipped in a
   feature-flagged Playwright project for one preview run.
5. Build route-table output is captured for off, report, and enforce preview
   modes; any static-to-dynamic route changes are recorded with an accepted
   cache/performance decision before enforcement.
6. A Sentry alert for the script directive family and first-party
   classification count greater than zero per hour is configured and silent
   during the window. DG04 or the follow-up fix slice must either add and pin a
   derived `csp.first_party=true` tag or document an equivalent saved Sentry
   query using the existing `csp.blocked_host` and `csp.document_host` tags.

DG04 must also define the ongoing monitoring posture: a page-able first-party
script directive-family alert, weekly blocked-host taxonomy review, a GTM
custom HTML tag constraint that forbids inline `<script>` without nonce
compatibility review, and a Paddle SDK upgrade check against report-only smoke
before merge.

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
