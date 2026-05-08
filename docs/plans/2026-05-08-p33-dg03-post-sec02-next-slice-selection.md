# P33-DG03 Post-SEC02 Next Slice Selection

## Metadata

- Date: 2026-05-08
- Slice: `P33-DG03`
- Status: Complete
- Owner: `platform + security + qa`
- Purpose: close `P33-SEC02 CSP Nonce Phase 0 Report-Only` and select the next
  bounded P33 production-maturity gate without promoting unsafe CSP enforcement.

## Scope Boundary

This is a docs-only promotion and design-gate slice. It updates repo-canonical
program/tracker records and appends the existing CSP migration design. It does
not authorize runtime code changes, product behavior changes, new tests, schema
migrations, proxy changes, auth or tenancy refactors, canonical route changes,
Stripe reintroduction, README, AGENTS, or architecture-doc changes.

Canonical routes remain `/member`, `/agent`, `/staff`, and `/admin`. Existing
`*-page-ready` clarity markers remain contractual. `apps/web/src/proxy.ts`
remains the sole routing, access-control, and tenant-isolation authority and is
not edited by this gate.

## Evidence Reviewed

| Evidence                                         | Finding                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P33-DG02`                                       | Promoted exactly one implementation slice, `P33-SEC02 CSP Nonce Phase 0 Report-Only`, and kept CSP enforcement, style nonce enforcement, durable storage, analytics rewrites, build guards, storage RLS, supply-chain, drills, data lifecycle, performance, and repo hygiene deferred. |
| PR `#676` / merge `7c7f193f`                     | SEC02 shipped report-only nonce CSP behind `CSP_NONCE_MODE=report`, the `/api/csp-report` ingestion route, nonce propagation, Sentry warning capture, E2E header coverage, standalone build stamping, and a guarded `enforce` mode.                                                    |
| SEC02 browser smoke                              | Report-only mode still emitted first-party `script-src` reports. Phase 1 enforcement would risk blocking app JavaScript and is not promotable.                                                                                                                                         |
| `docs/security/csp-nonce-migration.md`           | The migration design already names Phase 0 report-only observation and Phase 1 enforcement, but needs the post-SEC02 hypothesis tree, data taxonomy, numerical Phase 1 acceptance bar, and monitoring posture.                                                                         |
| `apps/web/src/lib/security/csp-nonce.test.ts`    | Rollback parsing is pinned by `falls back to off with a warning for invalid non-production mode "$raw"` and production fail-fast cases for empty and invalid values.                                                                                                                   |
| `apps/web/src/lib/proxy-logic.csp-nonce.test.ts` | Off/report behavior is pinned by `keeps off mode on the current enforced CSP only` and `keeps the enforced CSP byte-identical in report mode`.                                                                                                                                         |
| `apps/web/playwright.config.ts`                  | `GATE_MK_CONTRACT_MATCH` already includes `GATE_SECURITY_MATCH`, so the earlier suspected MK-side header-spec hole is currently closed. DG04 must keep this verified.                                                                                                                  |
| Context7 Next.js `v16.2.2` CSP guidance          | Current Next.js guidance still expects proxy-generated nonce, `x-nonce`, a nonce-bearing `Content-Security-Policy` request header, and matching response CSP for automatic framework-script nonce application.                                                                         |

## Decisions

### 1. Close SEC02, But Do Not Promote Phase 1 Enforcement

Decision: record `P33-SEC02` as complete, but explicitly reject CSP Phase 1
enforcement as the next slice.

SEC02 achieved the intended Phase 0 result: report-only telemetry exists and
the enforced CSP remains unchanged. It also produced the key risk signal:
first-party `script-src` reports still appear. Enforcing now would convert those
reports into blocked scripts and could break Next framework bootstrapping, RSC
streaming, app inline runtime behavior, or instrumentation.

### 2. Promote A Hypothesis-Driven CSP Design Gate

Decision: promote exactly one next bounded design gate:

**`P33-DG04 CSP First-Party Script Nonce Coverage Design Review`**

DG04 is design-only and must confirm or eliminate a prioritized hypothesis tree
using SEC02 report data. Its deliverable is not a generic investigation; it must
state which hypothesis was confirmed and define the smallest safe follow-up fix
slice, or state why the evidence is inconclusive and promote a smaller
instrumentation slice.

### 3. Keep The Parallel Maturity Track Visible

Decision: after DG04 lands, the operator may run two disjoint follow-up tracks
in parallel when repo state allows it:

1. DG04's CSP fix slice, likely `P33-SEC03 First-Party Script Nonce Coverage`.
2. The next-priority P33 maturity category, `withTenantContext` build-guard
   design.

These touch different files, have different reviewer paths, and should not be
serialized unnecessarily once DG04 has produced its fix contract. DG03 does not
open both branches now; it records the parallelization rule for the next
operator.

## DG04 Hypothesis Tree

DG04 must test these hypotheses in order:

| Hypothesis                                    | Description                                                                                                                                                                                | First measurement                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 - Next framework scripts                   | React DOM bootstrap and RSC streaming flush emit inline `<script>` tags. They get nonces only if the CSP request header contains a nonce token and `x-nonce` is on cloned request headers. | Verify SEC02 request header propagation, response header shape, and captured HTML framework script nonce coverage. Most likely root cause.                |
| H2 - `next/script` calls missing `nonce` prop | `_core.entry.tsx` passes `nonce={cspNonce}` to `<AnalyticsScripts>`, but each `<Script>` inside `analytics-scripts.tsx` must consume it.                                                   | Inspect rendered GTM and Meta Pixel script tags when env IDs exist; fix is trivial if any prop is missed.                                                 |
| H3 - Sentry client boot script                | The Sentry client SDK may inject a small inline boot or instrumentation script.                                                                                                            | Correlate reports with `instrumentation-client.ts`, Sentry client artifacts, and captured inline samples where available without storing `script-sample`. |
| H4 - Third-party runtime-injected scripts     | Paddle, Sentry replay, GTM, or Pixel may inject descendant scripts. With correct `'strict-dynamic'`, nonce-trusted parents should authorize descendants.                                   | Verify report-only `script-src` includes `'strict-dynamic'` and `https:` fallback, then group by third-party host.                                        |
| H5 - Browser extension noise                  | Password managers and extensions can create `chrome-extension://`, `moz-extension://`, or `safari-web-extension://` reports.                                                               | Classify as extension noise; document but do not block Phase 1.                                                                                           |

DG04's first canary check is the SEC02 no-op probe:
`<script data-csp-nonce-probe nonce={cspNonce} />`. If that probe appears in
CSP reports, nonce propagation is broken end-to-end and DG04's first hour must
find the break. If it does not appear, hand-authored script nonce propagation
works and the likely causes are H1, H3, or H4.

## DG04 Data Collection Contract

DG04 must use evidence, not anecdote:

- Source of truth: Sentry events in the script directive family
  (`csp.directive=script-src`, `script-src-elem`, or `script-src-attr`, or the
  equivalent `csp.directive:script-src*` search), plus local report-mode browser
  smoke when staging data is unavailable.
- Window: 48-72 hours in staging, or local report-mode smoke across at least
  six representative flows.
- Required flows: landing `/`, login, register, member dashboard, claim wizard
  step 1, pricing, and agent home, across each supported pilot tenant when
  feasible.
- Aggregation: group by `csp.directive` plus `csp.blocked_host`; strip query
  strings from `document_uri`. If the final implementation normalizes
  directive-family tags separately, keep the raw directive token visible in the
  table.
- Output: append a markdown table to `docs/security/csp-nonce-migration.md`
  with columns `directive | blocked_host | document_host | count | category |
hypothesis | proposed fix`.

## Violation Taxonomy

DG04 must classify reports before applying promotion criteria:

| Category                     | Rule                                                                                          | Phase 1 impact                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| First-party blocking         | `blocked-uri = 'inline'` or blocked host equals document host.                                | Must fix before Phase 1.                                                             |
| Third-party allowlisted host | Blocked host is in the current intended script surface such as Paddle, GTM, Pixel, or Sentry. | Should be zero with `'strict-dynamic'`; non-zero implies a wiring or host-chain gap. |
| Browser extension            | `chrome-extension://`, `moz-extension://`, or `safari-web-extension://`.                      | Noise; document and do not block Phase 1.                                            |
| Random or unknown host       | Neither own-origin, allowlisted, nor extension.                                               | Triage manually; often a chained analytics or iframe dependency.                     |

## Phase 1 Promotion Bar

DG04 must preserve this numerical bar for any later Phase 1 promotion:

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
6. A Sentry alert for the script directive family and first-party classification
   count greater than zero per hour is configured and silent during the window.
   DG04 or the follow-up fix slice must either add and pin a derived
   `csp.first_party=true` tag or document an equivalent saved Sentry query using
   the existing `csp.blocked_host` and `csp.document_host` tags.

## Time Box And Output

DG04 is design-only and time-boxed. It must produce a design doc plus the
violation table within five working days. If no hypothesis stands up cleanly,
DG04 must output a smaller exploratory implementation slice, such as adding
explicit CSP-violation labels to the canary probe and observing again, rather
than inventing an opinionated fix.

## Candidate Ranking

| Rank | Candidate                                                                                                                           | Decision                      | Reason                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `P33-DG04 CSP First-Party Script Nonce Coverage Design Review`                                                                      | Promote                       | SEC02 exposed a concrete first-party script report signal, so the next safest step is hypothesis-driven design before enforcement.                     |
| 2    | `CSP Phase 1 Enforce`                                                                                                               | Reject                        | First-party report-only signal is not clean; enforcement could block app JavaScript.                                                                   |
| 3    | `withTenantContext` build-guard design                                                                                              | Defer but mark parallelizable | Valuable DB-tenancy enforcement work, but it does not unblock the now-visible CSP path; after DG04 lands it can run in parallel with DG04's fix slice. |
| 4    | Storage RLS backstop design                                                                                                         | Defer                         | Separate storage-isolation category with no dependency on CSP report triage.                                                                           |
| 5    | Supply-chain attestation, restore drills, threat modeling, incident drills, lifecycle automation, performance budgets, repo hygiene | Defer                         | Valid P33 backlog items, but none unblock the active CSP enforcement path and each needs a separate bounded gate.                                      |

## DG04 Non-Goals

- No runtime or product code changes.
- No CSP enforcement.
- No new test files.
- No `proxy.ts`, route, auth, tenancy, schema, Stripe, README, AGENTS, or
  architecture-doc changes.
- No durable CSP violation storage.
- No analytics, Paddle, Sentry, or PostHog rewrites.
- No Phase 1 promotion unless the numerical bar above is already met.

## Monitoring Posture Required From DG04

DG04 must define the ongoing Phase 1 monitoring posture:

- Sentry alert: script directive-family first-party count greater than zero per
  hour is page-able, using either a pinned `csp.first_party=true` tag or an
  equivalent saved query based on `csp.blocked_host` and `csp.document_host`.
- Weekly review: aggregate `csp.directive` by `csp.blocked_host`, classify new
  entries into the four taxonomy categories, and record unresolved first-party
  entries.
- GTM operational note: marketing must not add custom HTML tags with inline
  `<script>` without nonce compatibility review; this note belongs in
  `docs/security/csp-nonce-migration.md`.
- Paddle upgrade note: each Paddle SDK bump must be checked against report-only
  stream or local report-mode smoke before merge.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` is untouched by this gate.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain
  unchanged.
- `*-page-ready` clarity markers remain unchanged.
- This gate avoids auth, tenancy, routing, and architecture refactors.
- Stripe remains unused.
- Product runtime and test files are untouched.

## Verification Plan

Before PR:

- `git diff --check`
- `git diff --stat` in the PR body proving only `docs/` is touched
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`
- Repo QA MCP scope audit with `docs/` allowed and runtime/proxy/auth/tenancy
  paths forbidden

Remote PR checks should include SonarCloud, Copilot, CI, PR finalizer, and Pilot
Gate. This docs-only gate does not require implementation reviewers, Codex
Security scan, required-gates, or browser validation unless runtime files are
changed unexpectedly.
