---
status: design-review
date: 2026-05-09
slice: P33-DG07
title: CSP Nonce Migration Architecture Rebaseline
owner: platform
phase: Phase C
---

# P33-DG07 CSP Nonce Migration Architecture Rebaseline

## Decision

`P33-DG07` accepts the `P33-SEC05` classification: the current Phase 0 CSP nonce
architecture cannot make first-party framework/runtime script reports clean while preserving
the existing enforced `Content-Security-Policy` header unchanged.

The blocker is the two-header Phase 0 shape:

```text
Content-Security-Policy: existing non-nonce enforced policy
Content-Security-Policy-Report-Only: nonce policy with 'strict-dynamic'
```

SEC05 proved that this shape causes Next.js to prefer the non-nonce enforced CSP when
deciding whether to apply nonces to framework and page-bundle scripts. As a result, SEC03
must remain blocked under the current architecture.

SEC05's load-bearing source receipt is pinned here for upgrade review:

- `apps/web/package.json` declares `next` as `^16.2.4`.
- `pnpm-lock.yaml` resolves the web app's Next dependency to `next@16.2.4` with integrity
  `sha512-kPvz56wF5frc+FxlHI5qnklCzbq53HTwORaWBGdT0vNoKh1Aya9XC8aPauH4NJxqtzbWsS5mAbctm4cr+EkQ2Q==`.
- The installed package reports version `16.2.4`; its npm package metadata does not expose a
  `gitHead`.
- `apps/web/node_modules/next/dist/esm/server/app-render/app-render.js` contains the App
  Router request-header parser:

```js
const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
const nonce = typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined;
```

- `apps/web/node_modules/next/dist/esm/server/app-render/get-script-nonce-from-header.js`
  then extracts the first `'nonce-*'` source from `script-src`, falling back to `default-src`.

`P33-DG07` does not promote CSP Phase 1 enforcement, does not reopen SEC03, and does not
authorize an implementation workaround. `CSP_NONCE_MODE=enforce` remains guarded.

DG07 sets the Phase 0 production posture to **available but default off**:
`CSP_NONCE_MODE=off` is the intended production state unless a later, bounded diagnostic
window explicitly enables `report` with the budget controls defined below. The Phase 0 code
remains in place as a future hook. Removal requires a separate slice and the retirement
cadence below.

The recommended next program move is to pause CSP enforcement migration work and promote the
next non-CSP P33 maturity design gate:

`P33-DG08 Storage RLS Backstop Design Review`

## Inputs

| Input        | Relevance                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P33-SEC02`  | Shipped report-only nonce observation and exposed first-party script-family reports while preserving the existing enforced CSP.                                                |
| `P33-DG04`   | Confirmed H1: first-party Next framework/static chunk and runtime inline scripts are the blocker before CSP enforcement.                                                       |
| `P33-SEC03`  | Reached the designed stop with supported hooks present but Next-owned scripts unnonced; landing smoke recorded `missingNonceCount=72` and `firstPartyScriptViolationCount=84`. |
| `P33-DG06`   | Required a focused triage slice before any SEC03 retry or Phase 1 work.                                                                                                        |
| `P33-SEC05`  | Classified the blocker as a report-only architecture mismatch with the current two-header Phase 0 model.                                                                       |
| `P33-SEC04B` | Completed the parallel tenancy posture burn-down, leaving P33 free to choose the next maturity category.                                                                       |

## Current Framework Guidance

Context7 for Next.js `v16.2.2` confirms the documented CSP nonce path:

- generate a per-request nonce in proxy logic;
- set `x-nonce` on cloned request headers;
- set a nonce-bearing `Content-Security-Policy` request header;
- return `NextResponse.next({ request: { headers } })`;
- emit the matching `Content-Security-Policy` response header;
- read `x-nonce` with `headers()` in App Router Server Components;
- force dynamic rendering with `connection()` or equivalent request-time rendering;
- let Next.js automatically apply the nonce to framework scripts, page bundles, inline
  framework scripts/styles, and `next/script` components that receive the `nonce` prop.

The documented path uses `Content-Security-Policy`, not a competing
`Content-Security-Policy-Report-Only` policy beside a non-nonce enforced CSP. SEC05's
installed-source inspection explains the observed behavior: Next's App Router nonce
extraction checks `content-security-policy` before `content-security-policy-report-only` and
does not fall through when the enforced header exists without a nonce.

Browser CSP behavior also matters for the migration architecture: adding a nonce or
`'strict-dynamic'` to the enforced `script-src` is not neutral metadata. In modern CSP
browsers, nonce/hash sources and `'strict-dynamic'` change how `'unsafe-inline'` and host
allowlists are interpreted. Therefore, adding a nonce-bearing script policy to the existing
enforced CSP in report mode would be a behavioral enforcement change, not a safe observation
step.

More specifically, under CSP3 behavior, when `'strict-dynamic'` appears in `script-src` with
a nonce or hash, modern browsers ignore host-source expressions and `'unsafe-inline'` for
script trust. Trust propagates from nonce- or hash-authorized root scripts instead. Adding
nonce plus `'strict-dynamic'` to the enforced policy would therefore remove the host-allowlist
behavior that the current enforced CSP still relies on.

## Architecture Rebaseline

### 1. Phase 0 Report-Only Is Still Useful, But Not For First-Party Nonce Proof

Phase 0 can still exercise CSP report ingestion, payload normalization, Sentry capture,
rate-limiting, privacy minimization, and classifier behavior. It cannot prove the future
nonce enforcement policy is clean for first-party Next framework scripts while the existing
non-nonce enforced CSP remains present.

DG07 does not keep Phase 0 continuously enabled in production. The current operational state
is "available, default off": the code path can be enabled for bounded diagnostics with
`CSP_NONCE_MODE=report`, but routine production should use `CSP_NONCE_MODE=off` until a later
gate approves a new observation window.

Any future report-mode diagnostic window must name:

- duration and traffic scope;
- route-table/cache receipts before enabling the window;
- Sentry event budget or cap for `csp.violation` warnings;
- rollback threshold for report volume, rendering-mode drift, or user-visible regression;
- owner responsible for turning report mode back off at the end of the window.

Sentry evidence captured on 2026-05-09 from the configured project
`human-p5/interdmestik-nextjs`:

```text
statsPeriod=7d
query="csp.first_party:true csp.directive:[script-src,script-src-elem,script-src-attr]"
total=0 events; 7-day average=0/day
```

Interpretation: current Sentry does not provide active first-party CSP signal for Phase 0.
This is not evidence that the policy is clean; it is evidence that continuous production
reporting is not currently contributing useful first-party signal.

SEC03's acceptance criterion, "zero first-party script-family reports in report mode", is no
longer reachable under the current header architecture. That is an architecture constraint,
not an implementation failure in SEC03.

### 2. Preserve Current Enforced CSP Until A New Gate Explicitly Changes It

The existing enforced CSP remains the production safety baseline. DG07 does not authorize:

- adding a nonce or `'strict-dynamic'` to the enforced CSP in report mode;
- removing the enforced CSP to let Report-Only extraction work;
- switching production traffic to a nonce-enforced CSP;
- weakening Report-Only CSP to hide first-party reports.

Any future change to the enforced CSP must be promoted through a separate design gate with
explicit browser behavior, rollback, and route-performance evidence.

### 3. SEC03 Remains A Stop Record

SEC03 should not be retried unless one of the unlock conditions below is met. Reopening it
under the current two-header Phase 0 model would reproduce the same first-party script-family
failures.

### 4. Phase 1 Remains Blocked

The Phase 1 promotion bar remains intentionally unmet:

- first-party script-family reports are not clean in the current report-mode architecture:
  SEC03 local landing smoke recorded `missingNonceCount=72` and
  `firstPartyScriptViolationCount=84`; the current 7-day Sentry first-party script-family
  count is `0`, which means no active production signal, not cleanliness;
- authenticated and public flows have not passed a true nonce-enforced browser smoke:
  future proof must cover landing, pricing, login, register, member dashboard, claim wizard
  step 1, and agent home across Chrome, Firefox, and Safari, or document browser-specific
  blockers;
- route-table and dynamic-rendering impact still need renewed receipts: the last useful
  report-mode/build receipts came from SEC03/SEC05 evidence on the SEC03/SEC05 branches and
  must be refreshed against the future architecture commit before any enforcement decision;
- Paddle, Sentry, analytics, and style-policy risks remain separate validation work:
  no current slice ID has approved checkout-overlay, Sentry client/replay, analytics runtime,
  or style nonce enforcement validation.

## Rejected Alternatives

| Alternative                                                                                   | Decision | Reason                                                                                                               |
| --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| Add nonce and `'strict-dynamic'` to the existing enforced CSP during report mode              | Reject   | This changes script execution semantics in modern browsers and can become de facto enforcement.                      |
| Remove the enforced CSP while running report-only nonce observation                           | Reject   | This weakens the current production security posture to obtain cleaner reports.                                      |
| Keep the enforced response CSP unchanged but inject a nonce CSP only into the request headers | Reject   | SEC05 Case B reproduced the SEC03 failure in a minimal app with this repo-shaped header model.                       |
| HTML-rewrite Next framework output                                                            | Reject   | Outside supported Next hooks and fragile against framework output changes.                                           |
| Monkey-patch Next internals                                                                   | Reject   | Not maintainable or supportable as a Phase C security migration strategy.                                            |
| Remove `'strict-dynamic'` or narrow report classification to silence reports                  | Reject   | Produces misleading evidence and does not prove the intended security policy.                                        |
| Reopen SEC03 immediately                                                                      | Reject   | The blocker is architectural; no supported hook has changed since SEC05.                                             |
| Wait indefinitely for Next.js to change behavior                                              | Reject   | Framework decisions are exogenous. Security maturity cannot pause on a framework roadmap with no committed timeline. |

## Future Unlock Conditions

CSP nonce enforcement migration can resume only after a later gate records one of these
conditions:

1. Next.js documents or ships a supported hook that lets apps choose a nonce-bearing
   Report-Only policy when an enforced CSP is also present.
2. A Next.js version change, including patch, minor, major, lockfile-only refresh, or
   dependency-range change, changes nonce extraction behavior, and a minimal repro plus
   product smoke prove the current two-header model now nonces first-party framework scripts.
3. The program explicitly approves changing the enforced CSP architecture before Phase 1,
   with browser semantics, route performance, rollback, and production-risk evidence.
4. A separate non-production preview harness is approved to test true nonce-enforced CSP
   behavior without changing production defaults or unguarding `CSP_NONCE_MODE=enforce`.
5. The program promotes a different long-term CSP architecture, such as Trusted Types,
   tightened SRI, or accepting `'unsafe-inline'` with explicit compensating controls, and
   explicitly retires the nonce-migration target in a separate gate.

None of these conditions is currently met.

Unlock condition 2 must become automated before the next Next.js version change, including
patch, minor, major, lockfile-only refresh, or dependency-range change, is treated as a
CSP-relevant unlock attempt. The required detector is a SEC05-adjacent reproduction check
that runs the minimal matrix against the currently installed Next version and asserts that
the repo-shaped Case B still fails. When a Next version change makes Case B pass, that
detector must fail loudly and force a DG07 unlock review. This DG07 PR remains docs-only;
adding the detector requires a later implementation or dependency-upgrade slice because it
would touch test or CI surfaces.

## Review And Retirement Cadence

DG07's unlock conditions are reviewed at every Next.js version change, including patch,
minor, major, lockfile-only refresh, or dependency-range change, and at minimum every six
months. If no condition has triggered by the six-month review, the program must choose one
of these outcomes:

- retire the nonce migration entirely and remove Phase 0 wiring through a dedicated slice;
- pivot to a non-nonce CSP architecture through a new design gate;
- renew the wait with a new evidence basis, including a current Next reproduction, Sentry
  signal check, and route-performance assessment.

All Phase 0 code remains in place until that retirement decision is made. Affected code paths:

- `apps/web/src/lib/proxy-logic.ts` for nonce generation and header writes;
- `apps/web/src/lib/security/csp-nonce.ts` for mode parsing and nonce CSP construction;
- `apps/web/src/app/api/csp-report/route.ts` for report ingestion;
- `apps/web/src/app/[locale]/_core.entry.tsx` for the nonce probe and root propagation;
- `apps/web/src/components/analytics/analytics-scripts.tsx` for analytics nonce props.

## Next-Slice Ranking

| Rank | Candidate                                                                                                                     | Decision | Rationale                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `P33-DG08 Storage RLS Backstop Design Review`                                                                                 | Promote  | `P33-DG01` already ranked storage RLS as the next security-maturity design category after CSP and DB access guard work. CSP is now architecturally blocked, and SEC04B closed the DB posture burn-down requirement. |
| 2    | CSP nonce-enforced preview harness                                                                                            | Defer    | Potentially useful later, but it needs its own explicit authorization because it tests an enforced nonce policy even if non-production only.                                                                        |
| 3    | Reopen SEC03                                                                                                                  | Reject   | No supported hook or architecture change exists that would make SEC03 pass.                                                                                                                                         |
| 4    | Additional DB posture burn-down                                                                                               | Defer    | SEC04B met the `<= 80` requirement and recorded remaining hard cases; more burn-down needs a new evidence basis.                                                                                                    |
| 5    | Supply-chain attestation, restore drills, threat modeling, incident drills, data lifecycle, performance budgets, repo hygiene | Defer    | Valid P33 maturity categories, but storage RLS is the next highest security isolation backstop from the existing roadmap evidence.                                                                                  |

## Promoted Slice

`P33-DG08 Storage RLS Backstop Design Review`

Scope for the next gate:

- name the attacker model before ranking fixes. At minimum DG08 must evaluate:
  tenant-A users crafting tenant-B storage paths, service-role key compromise or CI/env leak,
  and mass export from a route that authenticates one user but iterates without a tenant
  filter;
- inventory Supabase/storage access patterns that can bypass tenant RLS expectations;
- identify whether current upload/download paths use service-role, admin, signed URL, or
  app-mediated authorization;
- classify risks for documents, claim attachments, AI downloads, policy analysis artifacts,
  and any member/staff/agent storage surface;
- commit to making at least one named failure class structurally impossible, such as by
  engaging Storage RLS through user-scoped Supabase clients or enforcing tenant path prefixes
  at the bucket-policy boundary;
- decide whether the next implementation should be a gateway, presigned-service boundary,
  bucket policy hardening, test harness, or another bounded design gate;
- produce baseline inventory before drafting the DG08 decision: count `createAdminClient`
  callsites in `apps/web/src`, count distinct storage buckets in `supabase/migrations`, and
  list literal storage path templates;
- preserve proxy, canonical routes, auth layering, tenancy architecture, schema, Stripe,
  product UX, README, AGENTS, and architecture-doc boundaries unless a later gate explicitly
  authorizes otherwise.

## Tracker Status Convention

DG07 records `P33-SEC03` as semantically `blocked-by-architecture`. The tracker status enum
currently accepts `blocked` but rejects `blocked-by-architecture`, so the canonical tracker
keeps the audited status value as `blocked` and records `blocked-by-architecture` in the
evidence text. This semantic state is distinct from:

- `pending`: the slice can start now;
- `blocked`: the blocker is unresolved but not yet classified;
- `failed`: the slice attempted its own acceptance criteria and did not produce an accepted
  stop record;
- `completed`: the slice delivered its approved outcome.

`P33-SEC05` remains completed because it delivered the classification evidence. Future status
reports should preserve this distinction: SEC03 is paused by architecture; SEC05 is the
evidence that explains why.

## Acceptance Criteria

`P33-DG07` passes only if it:

- records SEC05's report-only architecture mismatch as the active CSP blocker;
- keeps SEC03 blocked and `CSP_NONCE_MODE=enforce` guarded;
- rejects Phase 1 enforcement and all prohibited workaround paths;
- updates `docs/security/csp-nonce-migration.md` to say Phase 0 cannot prove first-party
  nonce cleanliness under the current two-header model;
- records the Phase 0 production posture as `CSP_NONCE_MODE=off` by default with report mode
  available only for bounded diagnostics;
- records `P33-SEC03` as semantically `blocked-by-architecture` in
  `docs/plans/current-tracker.md` while preserving the audit-accepted `blocked` enum;
- promotes exactly one next bounded design gate outside the blocked CSP path;
- preserves product runtime code, `apps/web/src/proxy.ts`, canonical routes, auth, tenancy,
  schema, Stripe, README, AGENTS, and architecture-doc files.

## PR Scope Guards

The DG07 PR is docs-only:

- touches only `docs/plans/` and `docs/security/csp-nonce-migration.md`;
- does not touch TypeScript, JavaScript, JSON config, tests, workflow files, `package.json`,
  `pnpm-lock.yaml`, README, AGENTS, or architecture docs;
- requires `pnpm purity:audit` to pass;
- should show only `docs/` files in `git diff --stat`.

## Reviewer Pool

DG07 uses a docs/design reviewer pool before PR:

- security/auth reviewer for the CSP and storage-isolation architecture decision;
- platform/infrastructure reviewer for per-request nonce and dynamic-rendering tradeoffs;
- performance/scalability reviewer for Phase 0 keep/off/retire posture;
- documentation reviewer for the architecture-rebaseline narrative future owners will use.

## Operations Note

For incident response and on-call references: CSP nonce enforcement migration is paused per
DG07 on 2026-05-09. Phase 0 report-only remains available but production-default off.
SEC03 cannot resume without one of DG07's unlock conditions. The architecture rebaseline is
recorded in `docs/security/csp-nonce-migration.md`.

## Verification Plan

DG07 is a design-gate slice. Required local verification after the accepted draft is applied
to the canonical program/tracker files:

```bash
git diff --check
pnpm plan:status
pnpm plan:audit
pnpm track:audit
pnpm docs:verify
pnpm purity:audit
pnpm verify-slice -- --static
```

No browser validation is required for DG07 because it does not change product runtime
behavior. Browser validation returns only if a later implementation slice changes CSP
headers, storage authorization, product UI, or verification surfaces.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth, tenancy, routing, domain architecture, schema, and Stripe remain untouched.
- No product runtime code changes are authorized.
- No README, AGENTS, or architecture-doc edits are authorized.
- CSP Phase 1 enforcement is not promoted.
