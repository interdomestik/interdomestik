# IDA-DG47 — T-115 / OD#17 public-shell performance proof

Status: reviewed candidate; no runtime authority

Base main: `4b2da57cfb872ee557b034fe44693ca67992bd98`

## Decision

Promote only one Tier 3 verification-infrastructure result:

> Add a fail-closed, exact-head OD#17 evidence lane for the already-implemented
> neutral `ida.*` public shell. It may certify the public shell only when all
> three canonical measurements are collected from their stated targets:
> Lighthouse mobile performance **greater than 90**, entry JavaScript **less
> than 120 KiB gzipped**, and public-page TTFB **less than 100 ms from the
> Edge CDN**. Otherwise it must return a non-certifying failure classification.

This consumes no UI redesign work. It closes neither `T-118` nor `T-117`, and
does not change the public shell, routes, session behavior, or tenant boundary.

## Why this is the smallest valid result

`T-115 P0A` and `P0B` supply the public-host and pending-session behavior.
The sole residual preceding both `T-118` and `T-117` is OD#17. Existing
`apps/web/scripts/check-size.mjs` checks a 250 KiB global baseline and CRM
chart chunks, not the `<120 KiB` `ida.*` entry contract. Existing CI has no
Lighthouse collector. The checked-in Vercel configuration ignores ordinary PR
deployments unless `ENABLE_VERCEL_DEPLOYMENTS=1`, so a localhost timing or an
ignored Vercel status cannot be relabelled as Edge-CDN TTFB evidence.

The implementation therefore owns exactly one outcome: an OD#17 controller
which pins the exact tested Git tree, asset manifest, browser report, and
provider deployment identity, and refuses certification if any input is absent,
redirected, stale, mismatched, locally served, cached without provenance, or
outside the designated non-production provider target.

## Classification and value

- Classification: shared CI/performance-verification infrastructure.
- Risk tier: 3, because a false pass would unblock dependent M1 UI work and
  changes a shared verification surface.
- Operational value: future M1 UI changes get one reproducible pass/fail
  decision rather than treating an unrelated global bundle check as T-115 proof.
- Primary hypothesis: an exact-head controller can distinguish a real `ida.*`
  public-shell budget result from unavailable or non-equivalent evidence.
- Primary metric: one content-addressed verdict with all three metric values and
  their targets; no metric can be skipped, substituted, or reused across heads.

## Frozen writer map

The implementation may modify at most these eight paths, plus deterministic
repository-size metadata only if final staged paths require it:

1. `scripts/ci/od17-public-shell-performance.mjs`
2. `scripts/ci/od17-public-shell-performance.test.mjs`
3. `apps/web/scripts/check-size.mjs`
4. `apps/web/scripts/check-size.test.mjs`
5. `package.json`
6. `.github/workflows/ci.yml`
7. `scripts/ci/workflow-contracts.test.mjs`
8. `scripts/repo-size-budget.json` (conditional deterministic sync only)

No ninth functional writer is authorized. If a provider adapter, a second
workflow, a new GitHub secret, a Vercel configuration change, a browser fixture,
or a new package is required, stop and prepare a new gate rather than widening
this one.

## Explicit exclusions

- `apps/web/src/proxy.ts`, canonical routes, headers, public page components,
  layout, skeleton, `ida.*` host resolution, session/auth, tenancy, branding,
  i18n, database/schema/RLS, billing/provider code, analytics, and product UI.
- `T-117`, `T-118`, `T-116`, Hero/dashboard redesign, broader performance work,
  authenticated bundle ceilings, cache-policy choices, Pilot/Sonar work, and
  CI simplification unrelated to this evidence lane.
- Production deployment, production data, manual provider deployment, Mac
  Docker/Supabase, AI OS publication/refresh/runtime mutation, and Z620 use.

## Contract and cause precedence

Certification is valid only if all conditions hold, in this order:

1. The tested commit is exactly `github.event.pull_request.head.sha`, never
   `$GITHUB_SHA` on a pull request. CI checks out that source SHA explicitly;
   `git rev-parse HEAD`, provider health metadata, Lighthouse report, manifest
   report, and final verdict must each equal it. The public URL resolves to a
   non-production provider deployment explicitly bound to that source head.
2. The request remains on the canonical neutral `ida.*` public entry and
   receives an attributable Edge/CDN response; redirect, auth, tenant, or
   local-server paths fail closed.
3. The entry asset list is the deduplicated initial JavaScript closure for all
   three canonical public locale roots (`/sq`, `/mk`, `/en`): runtime/root,
   shared layout, page and client-reference JavaScript required at first load.
   The controller uses the maximum gzip sum and cross-checks every
   Lighthouse-observed JavaScript URL against the exact build manifest; any
   missing, unreadable, ambiguous or unattributed asset fails. A global bundle
   total is never a substitute.
4. A mobile Lighthouse run is complete and reports score `> 90`; a missing,
   partial, cached-only, or tool-error report fails.
5. The Edge TTFB sample is collected with explicit URL, commit/deployment
   identity, response headers, timing method, and network location. A local
   measurement, a Vercel ignored deployment, or unavailable provenance returns
   `measurement_capability_missing`, not PASS.
6. One immutable verdict binds the metric artifacts and source hashes. Its
   status is `pass`, `budget_failed`, `head_mismatch`, `target_mismatch`,
   `measurement_capability_missing`, or `provider_failure`; only `pass` can
   satisfy OD#17.

## Acceptance evidence

| Criterion                | Proof                                                                               | Required result                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest attribution     | focused unit test and exact build-manifest fixture                                  | all SQ/MK/EN locale-root initial asset closures are summed; the maximum must be `<122,880` bytes and every observed asset must be attributed    |
| Measurement integrity    | focused controller/unit tests                                                       | stale head, redirect, local URL, absent provider identity, missing metric, cache-only response and malformed report all fail closed             |
| Exact-environment canary | GitHub Ubuntu against a pre-existing, exact-head non-production provider deployment | validates DNS/IPv4, identity, neutral route, response provenance and collector availability before the full job; skipped/unavailable is failure |
| OD#17 verdict            | a non-skippable step of the already-required `audit` job on the source PR head      | all three original thresholds pass, or the required `audit` context fails with a classified non-certifying result                               |
| Regression authority     | exactly one full exact-head PR E2E                                                  | all required existing gates are green; no second browser run unless head or E2E environment changes                                             |

## Required gates

Focused proof precedes heavy work: the two new focused tests, existing size
test, `node --test scripts/ci/workflow-contracts.test.mjs`, `git diff --check`,
`pnpm check:modularity-guard`, and conditional `pnpm repo:size:check`.

Because this is shared CI infrastructure, the new controller is a
non-`continue-on-error`, non-skippable step in the already-required `audit`
context; it may not become a separate advisory job. A workflow contract must
prove that missing, cancelled, skipped, failed, or capability-missing OD#17
evidence fails that context. Required final evidence is
`pnpm slice:verify`, `pnpm pr:verify`, `pnpm security:guard`, `pnpm e2e:gate`,
and one `pnpm ci:local:full` supporting parity lane. The merge authority is one
full exact-head PR E2E in GitHub Ubuntu, not any local duplicate. Request and
classify Copilot feedback, CodeQL, gitleaks/audit, Sonar, reviewer feedback and
`pr-finalizer` on the exact head. The user has explicitly waived Codex Security
diff scan; repo-native security gates remain required.

## Environment and resource boundary

There is one special proof environment: GitHub-hosted Ubuntu plus an already
created non-production Vercel deployment bound to the PR source head. Before
runtime, the canary must pass with evidence generated at implementation time.
It cannot be manufactured from the current ignored-preview configuration. No
Mac Docker or local Supabase is permitted. If the capability is not present
without adding provider permissions/configuration or triggering a deployment,
the required `audit` context must fail as `measurement_capability_missing`;
that is honest proof that OD#17 remains open, not permission to expand provider
scope.

## Highest-risk cases

1. A valid bundle is paired with a wrong-head deployment.
2. A public request silently redirects to login, tenant, or production.
3. Cached response timing is reported as Edge TTFB without deployment/header
   provenance.
4. A missing Lighthouse binary or unavailable preview becomes a green skip.
5. A build emits an untracked entry chunk or the controller sums global assets.
6. A workflow change weakens existing E2E/security/finalizer gates.

## Rollout, rollback, and stop conditions

The lane is opt-in only for the exact defined CI event and creates no production
deployment. Roll back by reverting its single implementation merge if it blocks
unrelated CI or yields a false result. Immediately disable certification (not
the existing gates) for target/head/provenance ambiguity, false positive, or
provider identity mismatch.

Stop and re-gate before mutation if more than eight functional writers, a new
provider secret/permission, any production deployment, a new package, a second
workflow, product-route code, `proxy.ts`, or an additional independent proof
environment becomes necessary. The first implementation action is a RED test
for an ignored/local/wrong-head deployment classification.

## Runtime authority

This document grants no runtime, branch, worktree, product session, provider,
deployment, or production authority. After this docs-only gate merges, resolver
and current-main checks must select exactly this slice and a separately
content-addressed runtime receipt must bind then-current main, the fresh
GitHub/preview canary, writer map, and disk preflight before code begins.

## Follow-on boundary

After this outcome is actually PASS, merged, and closed, only one fresh
authority selection may promote either `T-118` **or** `T-117`; neither is
promoted by this gate and they may not run together.
