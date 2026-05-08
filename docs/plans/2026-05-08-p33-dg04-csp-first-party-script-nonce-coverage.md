---
plan_role: input
status: archived
source_of_truth: false
owner: platform + security + qa
date: 2026-05-08
last_reviewed: 2026-05-08
tracker_path: docs/plans/current-tracker.md
program_path: docs/plans/current-program.md
security_doc_path: docs/security/csp-nonce-migration.md
---

# P33-DG04 CSP First-Party Script Nonce Coverage Design Review

> Status: Archived design gate. DG04 is complete. H1 confirmed. P33-SEC03 promoted.

## Decision

Promote exactly one bounded implementation slice:

`P33-SEC03 First-Party Script Nonce Coverage`

Do not promote CSP Phase 1 enforcement yet. DG04 confirms that the current Phase 0
report-only path still produces first-party script-family violations because framework and
static Next.js scripts are rendered without nonce attributes in production-like report
mode. The smallest next step is a nonce-coverage fix slice, not enforcement.

The `withTenantContext` build-guard design track remains parallelizable after this gate
lands. It touches a separate maturity category and should not wait for the CSP fix branch
unless operator capacity requires serialization.

## Evidence Reviewed

- `P33-SEC02 CSP Nonce Phase 0 Report-Only` PR `#676`: local smoke found `148`
  script-family report-only console reports across sampled pages, including `89` inline and
  `59` external script reports. `connect-src`, `frame-src`, and `style-src` reported zero
  violations in that smoke. Local analytics IDs were absent, so GTM and Meta runtime loading
  were not exercised.
- Current SEC02 code:
  - `apps/web/src/lib/proxy-logic.ts` emits the unchanged enforced CSP and, in report mode,
    clones request headers with `x-nonce`, request `Content-Security-Policy`,
    request `Content-Security-Policy-Report-Only`, response Report-Only CSP,
    `Report-To`, and observable response `x-nonce`.
  - `apps/web/src/lib/security/csp-nonce.ts` keeps `enforce` guarded for Phase 0 and emits
    `script-src 'self' 'nonce-{nonce}' 'strict-dynamic' https:` in report-only mode.
  - `apps/web/src/app/[locale]/_core.entry.tsx` reads `x-nonce` only when nonce mode is
    active, emits the `data-csp-nonce-probe` canary, and passes `nonce` to
    `AnalyticsScripts`.
  - `apps/web/src/components/analytics/analytics-scripts.tsx` applies the received nonce to
    the GTM and Meta Pixel `next/script` components.
  - `apps/web/src/lib/security/csp-report.ts` captures Sentry warning tags for
    `csp.directive`, `csp.disposition`, `csp.blocked_host`, and `csp.document_host`; it does
    not yet derive `csp.first_party`.
  - `apps/web/playwright.config.ts` already includes `GATE_SECURITY_MATCH` inside
    `GATE_MK_CONTRACT_MATCH`, so the earlier MK-side header-gate gap is closed.
- Next.js current guidance checked through Context7 for Next `v16.2.2`: Next expects a
  proxy-generated nonce, cloned request headers with `x-nonce`, a nonce-bearing CSP request
  header, matching response CSP, and dynamic rendering so framework and page scripts can
  receive nonce attributes.
- Sentry event query tooling was unavailable in this runtime. `tool_search` did not expose a
  Sentry events search tool for `csp.directive`, so DG04 uses SEC02 PR evidence plus local
  report-mode smoke as the source of truth.
- Playwright MCP was searched and exposed, but local browser calls failed with
  `Error: browserBackend.callTool: Target page, context or browser has been closed`. DG04
  therefore used the repo Playwright runtime as the least-risk browser fallback.

## Local Report-Mode Diagnostic

Focused header E2E was rerun in off and report modes:

- `pnpm --filter @interdomestik/web exec playwright test e2e/security/headers.spec.ts --project=gate-ks-sq --project=gate-mk-contract --workers=1 --max-failures=1 --reporter=line`
  passed with `4 passed, 2 skipped`.
- `CSP_NONCE_MODE=report pnpm --filter @interdomestik/web exec playwright test e2e/security/headers.spec.ts --project=gate-ks-sq --project=gate-mk-contract --workers=1 --max-failures=1 --reporter=line`
  passed with `6 passed`.

Then a report-mode production-like server was probed through the repo Playwright runtime on
public KS flows:

| flow     | status | report-only header | scripts | scripts missing nonce | inline missing nonce | external missing nonce | canary nonce matches | script-family console reports |
| -------- | ------ | ------------------ | ------- | --------------------- | -------------------- | ---------------------- | -------------------- | ----------------------------- |
| landing  | 200    | yes                | 73      | 72                    | 53                   | 19                     | yes                  | 83                            |
| pricing  | 200    | yes                | 49      | 48                    | 28                   | 20                     | yes                  | 60                            |
| login    | 200    | yes                | 34      | 33                    | 8                    | 25                     | yes                  | 39                            |
| register | 200    | yes                | 59      | 58                    | 28                   | 30                     | no                   | 98                            |

The report samples named first-party Next chunk URLs such as
`/_next/static/chunks/webpack-...js` and reported that `strict-dynamic` was present, causing
host allowlisting to be ignored by modern CSP evaluation. The canary matched on landing,
pricing, and login, which proves the hand-authored nonce path is not globally broken. The
register canary mismatch is a route-specific anomaly that `P33-SEC03` must recheck, but it
does not overturn the broader first-party framework-script finding.

## Hypothesis Outcomes

| Hypothesis                                | Outcome                                        | Evidence                                                                                                                                                                  | Required next action                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 - Next framework scripts               | Confirmed                                      | First-party `_next/static/chunks/*` and framework/runtime inline scripts render without nonce attributes while the report-only CSP contains a nonce and `strict-dynamic`. | `P33-SEC03` must make framework and first-party runtime scripts carry the active nonce in report mode without changing the enforced CSP shape. |
| H2 - `next/script` nonce props            | Eliminated for repo-owned analytics components | `_core.entry.tsx` passes `nonce={cspNonce}` to `AnalyticsScripts`, and the GTM plus Meta Pixel `Script` components consume `nonce={nonce}`.                               | Keep GTM/Pixel runtime smoke in `P33-SEC03` when analytics IDs are available.                                                                  |
| H3 - Sentry client boot script            | Not confirmed                                  | Local public smoke did not identify a Sentry-specific first-party boot script as the dominant source. Sentry event query tooling was unavailable.                         | Preserve as a targeted check in `P33-SEC03` if Sentry-tagged reports remain after H1 is fixed.                                                 |
| H4 - Third-party runtime-injected scripts | Not confirmed                                  | `strict-dynamic` is present. SEC02 did not exercise GTM/Pixel IDs locally, and DG04 public smoke did not cover Paddle checkout or third-party runtime chains.             | Keep analytics and Paddle smoke before Phase 1; do not block the H1 fix slice on third-party conjecture.                                       |
| H5 - Browser extension noise              | Not observed locally                           | Headless local smoke did not produce extension-scheme reports.                                                                                                            | Keep taxonomy and Sentry grouping so extension reports remain non-blocking noise.                                                              |

## Violation Table

DG04 appends the operational version of this table to
`docs/security/csp-nonce-migration.md`.

| directive               | blocked_host                  | document_host           | count                                            | category        | hypothesis | proposed fix                                                                                          |
| ----------------------- | ----------------------------- | ----------------------- | ------------------------------------------------ | --------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| script directive family | inline                        | ks.127.0.0.1.nip.io     | 89 SEC02; 117 DG04 local public-flow DOM samples | first-party     | H1         | `P33-SEC03` must nonce framework and runtime inline scripts in report mode, then rerun browser smoke. |
| script directive family | ks.127.0.0.1.nip.io           | ks.127.0.0.1.nip.io     | 59 SEC02; 94 DG04 local public-flow DOM samples  | first-party     | H1         | `P33-SEC03` must nonce first-party Next static chunk script tags in report mode.                      |
| script directive family | third-party allowlisted hosts | unknown from local data | 0 confirmed in DG04                              | third-party     | H4         | Recheck GTM, Pixel, Paddle, and Sentry replay after H1 is fixed and IDs are configured.               |
| script directive family | extension schemes             | unknown from local data | 0 observed locally                               | extension/noise | H5         | Keep as non-blocking taxonomy category and document any future Sentry examples.                       |

Counts combine two different evidence sources: SEC02 console reports from PR `#676` and
DG04 local DOM/console diagnostics. They are sufficient to choose the next fix slice but do
not replace the 14-day Sentry observation window required for Phase 1.

## P33-SEC03 Contract

`P33-SEC03 First-Party Script Nonce Coverage` is an implementation slice with this contract:

- Fix report-mode nonce coverage so first-party Next framework scripts, RSC/runtime inline
  scripts, and first-party `_next/static/chunks/*` scripts carry a nonce matching the active
  response `x-nonce`.
- Preserve byte-identical enforced CSP behavior in default/off mode and preserve the
  unchanged enforced CSP shape in report mode. Do not remove `'unsafe-inline'`.
- Keep `CSP_NONCE_MODE=enforce` guarded as unsupported until Phase 1 promotion criteria pass.
- Add or pin a report classification path for `csp.first_party=true|false`, or document an
  equivalent Sentry saved query that reliably distinguishes first-party reports.
- Extend E2E/browser proof so report mode asserts zero first-party script-family reports for
  the public smoke flows and the authenticated representative flows where storage state is
  available.
- Recheck the `data-csp-nonce-probe` canary on landing, pricing, login, register, member
  dashboard, claim wizard step 1, and agent home. The register mismatch from DG04 is a
  specific must-investigate case.
- Rerun route-table output for off, report, and any feature-flagged enforce preview, and
  record static-to-dynamic changes plus the accepted cache/performance decision.
- Keep analytics, Paddle, and Sentry runtime checks as smoke evidence, but do not rewrite
  those SDK integrations unless they are the confirmed remaining source after H1 is fixed.

Expected touch surface for `P33-SEC03` is limited to CSP nonce/report helpers, proxy-logic
helpers, root-layout nonce wiring if needed, focused tests, and security-header/browser specs.
`apps/web/src/proxy.ts` remains read-only unless a later explicit authorization names it.

## Non-Goals

- No CSP Phase 1 enforcement in DG04.
- No runtime or product code changes in DG04.
- No removal of `'unsafe-inline'` from any directive.
- No style nonce enforcement.
- No durable CSP report storage.
- No analytics, Paddle, Sentry, or PostHog SDK rewrite.
- No `apps/web/src/proxy.ts`, canonical route, auth, tenancy, schema, Stripe, README,
  AGENTS, or architecture-doc changes.
- No product UX changes.

## Rejected Alternatives

- Promote CSP Phase 1 enforcement: rejected because first-party script-family reports remain
  reproducible in report mode.
- Add only more instrumentation: rejected because H1 is already confirmed enough to define a
  bounded fix slice. `P33-SEC03` may add `csp.first_party` classification as part of the fix.
- Switch to style nonce enforcement: rejected because the observed blocker is script-family
  coverage, and style enforcement is a separate migration phase.
- Rewrite analytics or Paddle integration now: rejected because local evidence points first
  to framework/static first-party scripts, not third-party runtime chains.
- Serialize the `withTenantContext` build guard behind all CSP work: rejected because it is a
  disjoint maturity track and can run in parallel after DG04 lands.

## Phase 1 Promotion Bar

Phase 1 remains blocked until all existing migration-doc promotion checks pass:

1. 14 consecutive days of report-only data with zero first-party script directive-family
   violations after taxonomy triage.
2. Chrome, Firefox, and Safari report-mode smoke shows zero new first-party violations, or
   skipped browsers are documented with a concrete blocker.
3. `data-csp-nonce-probe` has a matching nonce in every captured report-mode HTML sample.
4. All E2E gate specs pass when `CSP_NONCE_MODE=enforce` is flipped in a feature-flagged
   Playwright project for one preview run.
5. Build route-table output is captured for off, report, and enforce preview modes; any
   static-to-dynamic route changes are recorded with an accepted cache/performance decision.
6. A Sentry alert for first-party script-family reports greater than zero per hour is
   configured and silent during the observation window.

## Verification Plan

DG04 is docs-only. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

The PR body must include `git diff --stat` proving the final DG04 branch only touches
`docs/`.
