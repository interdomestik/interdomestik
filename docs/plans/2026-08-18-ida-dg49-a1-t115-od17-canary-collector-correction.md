# IDA-DG49-A1 — T-115 OD#17 canary collector correction

Status: reviewed corrective candidate R2; no repository or runtime authority

Base main: `70ab50a073c56045ff57433d04732fdf231b13d9`

## Decision

Correct one feasibility defect in the approved DG47/DG48/DG49/R2 chain. The
protected-main workflow `.github/workflows/od17-preview-canary.yml` is
token-inert and R2 marks it read-only. It can validate PR identity, but it
cannot request the approved short-lived OIDC token, reach the protected
exact-head Preview, run Lighthouse, or emit the evidence consumed by the PR
audit. OD#17 cannot produce PASS under the current writer map.

Authorize one bounded prerequisite gate/implementation sequence that turns the
existing workflow into the missing collector. It does not change the OD#17
outcome, thresholds, provider tuple, product code, public shell, routes,
session behavior, tenant boundary, deployment policy, or production state.
R2 supersedes only DG47 condition 3 and DG49-A1 R1 where they require local
build-manifest bytes to equal deployed Preview bytes. The exact-head deployment
binding, remote attribution requirement and all three thresholds remain intact.

Provider capability is no longer hypothetical. Exact external action receipt
`IDA-T115-OD17-OIDC-PREVIEW-CANARY-ACTION-R1` is 2,497 bytes / SHA-256
`d42274744ab102131b988132c040f1b15c14bd6f293e72cb62bc25dc2877bbcd`.
It proves the approved GitHub-Actions Trusted Source and the sensitive
`ENABLE_VERCEL_DEPLOYMENTS=1` variable scoped only to Preview branch
`codex/ida-t115-od17-performance-proof`. The next product commit can therefore
produce the exact-head automatic Preview; no manual deployment or additional
provider setting is required.

## Classification, hypothesis, and metric

- Classification: Tier 3 shared CI/performance-verification prerequisite.
- Outcome: one protected-main collector can create exactly one safe,
  content-addressed OD#17 evidence artifact for the exact open PR head.
- Falsifiable hypothesis: a two-job least-privilege workflow can measure the
  approved exact-head Preview without exposing its OIDC token or accepting
  stale, ambiguous, partial, redirected, production, or PR-controlled evidence.
- Primary metric: one terminal collector artifact whose raw inputs recompute to
  the same verdict and bind all three canonical metrics to one head and one
  unique non-production deployment.
- KEEP: all focused adversarial tests, one exact live canary, and the existing
  PR audit contract pass without token egress or ambiguous identity.
- REVERT: any false pass, token leakage, privilege crossover, target ambiguity,
  or inability to reproduce the verdict from raw evidence.
- INCONCLUSIVE: provider/registry/network/Chrome capability is unavailable;
  classify `measurement_capability_missing` and keep OD#17 open.

## Corrective writer map

The prerequisite authority PR may materialize only this gate plus the compact
current program/tracker promotion and deterministic size metadata. After that
gate merges and a replacement exact-main corrective runtime receipt is
approved, its implementation PR may modify only:

1. `.github/workflows/od17-preview-canary.yml`
2. `scripts/ci/od17-public-shell-performance.mjs`
3. `scripts/ci/od17-public-shell-performance.test.mjs`
4. `scripts/ci/od17-authenticated-lighthouse.mjs`
5. `scripts/ci/od17-authenticated-lighthouse.test.mjs`
6. `scripts/ci/workflow-contracts.test.mjs`
7. `package.json`
8. `pnpm-lock.yaml`
9. `scripts/repo-size-budget.json`, conditional deterministic sync only

This correction authorizes the existing workflow writer and one isolated
first-party-header collector helper. It pins `lighthouse@13.4.1` as a
devDependency through `package.json` and `pnpm-lock.yaml`; runtime registry
installation is forbidden. No other package, action, workflow, script, test,
or product path is authorized.

The original DG47 implementation writer map remains frozen for the subsequent
OD#17 verdict work. Corrective and original writers may not overlap in one
unreviewable commit: the corrective implementation lands first, then the
product-proof branch rebases onto exact main and continues under R2 or its
content-identical replacement binding.

## Privilege and execution topology

The workflow remains manual `workflow_dispatch`, protected-main only, and
bound to the exact same-repository open PR, branch
`codex/ida-t115-od17-performance-proof`, and supplied 40-character head SHA.
It must have no workflow-level `id-token` grant.

### Job 1 — unprivileged exact-head preparation

- `permissions`: `contents:read`, `pull-requests:read`, `id-token:none`.
- Validate repository/ref/open-PR/non-fork/branch/head before checkout.
- Checkout the exact PR head with credentials disabled.
- Install the frozen lockfile and run the named deterministic web build command
  with the gate-specified CI-safe environment. This build proves exact-head
  source/build closure only; it is not required to reproduce Vercel Preview's
  build-time public environment or deployed client bytes.
- Emit only the raw local build manifest, locale-root asset inventory,
  deduplicated initial-JavaScript asset bytes, source head, and build-command
  identity. No environment value/file, source map, server output or unrelated
  build artifact is permitted.
- Never resolve a deployment, request an OIDC token, or perform a provider
  request.

### Job 2 — trusted-main collector

- Checkout only trusted `main` with credentials disabled.
- Install the frozen trusted-main lockfile before invoking the pinned
  Lighthouse CLI; no dynamic/global/transient install is permitted.
- `permissions`: `contents:read`, `pull-requests:read`, `actions:read`,
  `deployments:read`, `id-token:write`; all other permissions are `none`.
- Download the preparation artifact and recompute its local manifest/asset
  content SHA, gzip byte count, locale closure and manifest result from raw
  bytes. Precomputed PR hashes, verdicts or totals are untrusted input. This
  local observation is structural and diagnostic only; it cannot authorize the
  deployed-byte performance verdict or require local/Preview byte equality.
- Resolve GitHub deployment metadata fail-closed: deployment SHA equals the PR
  head; environment is Preview/non-production; latest status is `success`;
  `environment_url` is HTTPS; and exactly one unique candidate remains. The
  exact unique URL must be the provider-supplied `VERCEL_URL`, never a mutable
  branch alias. Duplicate, absent, inactive, production, or mismatched targets
  fail before token acquisition.
- Request one GitHub OIDC token for audience
  `https://github.com/interdomestik`, exactly matching the audience in Action
  R1's stored Trusted Source tuple; mask it before first use, retain it only in
  process memory, and delete it from the process environment after capture.
- Never place the token in arguments, files, outputs, cache keys, artifacts,
  debug traces, or logs.

## First-party-only authenticated Lighthouse

Vercel Trusted Sources requires callers to attach the short-lived token in the
`x-vercel-trusted-oidc-idp-token` header. Lighthouse's global `extraHeaders`
setting is forbidden because it can propagate the token to PostHog, Sentry,
Axiom, or another third-party origin.

The collector launches the GitHub Ubuntu Chrome binary on a private loopback
debugging port, attaches a Chrome DevTools Protocol `Fetch` interceptor before
navigation, and then runs the pinned Lighthouse CLI against that exact port.
For every request and redirect hop:

- add the OIDC header only when `new URL(request.url).origin` is byte-identical
  to the exact Preview origin;
- remove the header from every non-matching origin and record only the
  redacted origin/classification;
- fail closed before navigation if the interceptor is not attached or loses a
  paused request;
- reject any final Lighthouse URL or main-document redirect whose origin or
  pathname no longer matches the requested canonical neutral locale root.

Focused tests must prove exact-origin acceptance, subdomain/lookalike/scheme/
port rejection, header stripping on third-party requests, redirect re-check,
token absence from serialized errors/results, and one simulated mixed-origin
page where no cross-origin request contains the header. CDP interception may
conservatively increase the measured time; it may never improve or fabricate a
performance score.

Authoritative technical basis:

- Vercel Trusted Sources documents the exact OIDC header and external GitHub
  Actions flow: `https://vercel.com/changelog/trusted-sources-for-deployment-protection`.
- GitHub requires `id-token:write` only on the job requesting the token:
  `https://docs.github.com/actions/reference/security/oidc`.
- Chrome DevTools Protocol `Fetch.continueRequest` can override headers per
  paused request and requires a new decision for redirect hops:
  `https://chromedevtools.github.io/devtools-protocol/tot/Fetch/`.
- Lighthouse supports attaching to an existing debugging port:
  `https://github.com/GoogleChrome/lighthouse/blob/main/readme.md`.

## Evidence and recomputation contract

The collector emits raw evidence plus a deterministic recomputed verdict. It
must bind:

- workflow path, protected-main `head_branch`, `workflow_dispatch` event, run
  ID, attempt, exact trusted-main workflow SHA, PR number, branch and head SHA;
- one deployment ID, exact deployment SHA/environment/production flag, one
  latest successful status ID, and unique exact `environment_url`/`VERCEL_URL`;
- local raw manifest and per-asset SHA/gzip inventory as an independently
  bound structural observation. It proves that exact-head source builds and
  exposes its locale-root graph, but it is never the deployed-byte oracle.
  Because public build inputs can legitimately differ between CI and Preview,
  local/remote filename, content-SHA or gzip divergence is diagnostic only and
  cannot fail or pass OD#17;
- the authoritative remote initial-JavaScript closure for each canonical
  locale. Trusted Job 2 derives it from the union of exact-origin script and
  module-preload URLs in the authenticated canonical page plus
  Lighthouse-observed first-party JavaScript requests. Every URL must remain on
  the unique exact-head Preview origin and be attributable to that page/network
  evidence; any missing, duplicate-with-different-content, ambiguous,
  cross-origin or otherwise unattributed asset fails closed. Job 2 fetches each
  deduplicated URL itself with the in-memory OIDC header and redirects disabled;
  any redirect, origin change, non-200 response or non-JavaScript response fails
  closed and the header is never re-sent. It computes content SHA and canonical
  gzip bytes from those deployed response bodies and uses the maximum
  locale-root closure for the 122,880-byte metric. A local build total, filename
  or content hash is never a substitute for deployed Preview bytes;
- Lighthouse version, Chrome version, mobile settings, report SHA and score;
- authenticated exact-content Edge TTFB probe URL/location/timing/headers and
  the distinct availability probe. The TTFB sample must use the exact Preview
  origin with OIDC, return the canonical neutral page with HTTP 200 and
  attributable Vercel Edge/CDN provenance, and must not time the protection or
  auth response. It explicitly includes the conservative Trusted-Source
  verification overhead; availability timing alone is never the TTFB metric;
- all locale roots, metric values and thresholds, raw-input hashes, failure
  class, and final verdict.

The later required PR `audit` step queries exactly one successful run of this
workflow whose path, event, `head_branch=main`, requested PR/head inputs,
attempt, artifact name, artifact digest and embedded head all agree. Artifact
name alone is never authority. The audit downloads the raw evidence and
recomputes the verdict; it never trusts a serialized `pass` field.

For the exact OD17 branch/head, this evidence check is non-skippable even when
the ordinary quick/draft lane skips broad `Run Audits`. All unrelated audit,
E2E, security, finalizer and CI triggers remain unchanged.

## Acceptance and failure matrix

- Wrong repo/ref/branch/head, fork, closed PR, PR-controlled privileged code,
  invalid permissions, non-main workflow code, or mutable action ref: fail
  before token use.
- Missing/duplicate/wrong-head deployment, non-Preview/production target,
  mutable alias, absent/failed latest status, redirect, protection/auth response
  instead of the expected HTTP-200 neutral page, tenant page, missing health
  provenance, or artifact mismatch: non-certifying failure.
- A remote initial asset absent from the authenticated page/network union,
  cross-origin, redirected, unavailable, content-ambiguous or not independently
  fetched is non-certifying. A local/Preview content difference alone is not.
- Missing Chrome/Lighthouse, frozen-install failure, OIDC failure, network/DNS,
  provider/API limit, incomplete report, or raw-evidence gap:
  `measurement_capability_missing` or `provider_failure`; never green skip.
- Lighthouse mobile performance must be greater than 90; trusted-main maximum
  initial SQ/MK/EN JavaScript closure below 122,880 recomputed gzip bytes;
  authenticated exact-content attributable Edge-CDN TTFB below 100 ms. Every
  metric is mandatory.
- Workflow-contract tests parse YAML by job and prove no workflow-level token,
  no token permission in Job 1, the sole token grant in Job 2, immutable action
  pins, exact event/branch/head binding, non-skippable PR audit, and unchanged
  required gates.

## Verification and review

Focused RED/GREEN proof precedes any live canary:

1. the two OD17 controller suites;
2. authenticated-Lighthouse request-policy/serialization tests;
3. parsed workflow-contract tests, including a fixture where local and Preview
   public build inputs produce different asset hashes while remote attribution
   and metric recomputation remain exact;
4. `git diff --check`, modularity guard, dependency/license/audit review, and
   deterministic repo-size sync/check;
5. the repo-required final gates for the corrective PR.

The corrective implementation merges after those checks; the live canary is
not a merge gate of that prerequisite PR. The product-proof branch then rebases
onto corrective exact main, adds the original DG47 proof implementation, and
produces one unique READY exact-head Preview. Exactly one protected-main canary
is dispatched per certified product-proof PR head; a later push invalidates the
old canary and permits only one replacement for the new head. Exactly one full
exact-head PR E2E remains the product PR merge authority.

One senior review is required on the complete corrective diff. Substantive
findings permit one consolidated remediation and one same-route re-review.
Copilot, Sonar, CodeQL, gitleaks, pnpm audit, security guard, finalizer, current
head identity, zero unresolved threads, and exact-main health remain required.
Codex Security diff scan remains waived by explicit user instruction.

Opus 5 review disposition is `REVISE findings addressed; no final model PASS
claimed`. The complete corrected design was reviewed in 156.599 seconds; its
gzip recomputation and protected-Preview TTFB feasibility findings were fixed
in one consolidation. Exact-artifact re-review ran in 179.907 seconds and found
only the redirect-disabled asset fetch and per-head canary wording gaps; both
are corrected above. No third review loop is authorized for these text-only
closures; repository audits and exact implementation review remain mandatory.
PR `#1588` current-head Codex review then found two sequential P1
acceptance-proof gaps. R1 closed the first by carrying bounded raw local asset
bytes for trusted-main recomputation. Review of R1 exact head
`790504ef6e19c12422dbc84539fcb1a34463fa74` then correctly found that local
and Vercel Preview client bytes need not match when build-time
`NEXT_PUBLIC_*` inputs differ, while the approved OIDC capability cannot read
provider environment values. R2 removes that false equivalence: local evidence
is structural only and the authenticated exact-deployment page/network bytes
are the sole bundle-metric authority. The outcome, writers, permissions,
provider scope and runtime boundary do not change. The P1 is addressed; no
final model PASS is claimed before amended current-head review.

## Rollback, residual risk, and stop conditions

Rollback is one revert of the corrective implementation merge; the existing
inert foundation remains safe. The Trusted Source and branch-scoped Preview
variable remain unchanged until the original R2 rollback or terminal OD17
closeout removes their exact unique tuples.

Residual risk is performance variance and provider availability; neither may
be converted into PASS. Stop and re-gate for another workflow, secret,
provider mutation, production deploy/alias, product code, browser extension,
certificate/MITM proxy, globally applied sensitive header, unpinned package,
new proof environment, or any permission beyond the listed per-job set.

No product/UI/auth/session/tenancy/routing/proxy/schema/RLS/billing/AI OS,
production, manual Vercel deploy, Mac Docker/Supabase, Z620, T-117, T-118, or
second slice is authorized. This gate grants no repository mutation or runtime
until its exact bytes/hash are approved and merged, followed by one separate
exact-main corrective runtime receipt.
