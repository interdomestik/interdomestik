# IDA-DG50 — T-115 OD#17 cache-isolated Preview recovery

Status: reviewed candidate with bounded findings addressed, not approved; no repository,
provider, or runtime authority

Base main: `0f0ddf3d6c00d51237fc6347c01c2aa4651936be`

## Decision

Promote no new product behavior. Recover only the still-open canonical
`IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF` outcome by replaying its preserved,
fully reviewed source tree onto current main and making one cache-isolated automatic
Vercel Preview attempt. The attempt may close OD#17 only if the exact PR head builds,
one protected-main canary recomputes all evidence, and every original threshold passes:

- Lighthouse mobile performance is strictly greater than 90;
- maximum authenticated Preview initial JavaScript closure across SQ/MK/EN is strictly
  below 122,880 gzip bytes; and
- authenticated attributable Edge-CDN public-page TTFB is strictly below 100 ms.

This gate does not alter the neutral public entry, routes, session behavior, tenant
boundary, copy, UI, thresholds, dashboard sequencing, or the already-complete T-115
P0A/P0B behavior. `T-118`, `T-117`, and every second slice remain unpromoted.

## Why one recovery attempt is justified

The terminal attempt is preserved in a verified Git bundle at 21,553 bytes / SHA-256
`5339bce12d57345f618bc83befe23fee1c6796c804f3f2e789bb36e2cbd78bd8`, head
`a5c5534da28cb37553daad5d696523baeba5da49`, required base
`a889f84aa9453f06d8ce51d8c865680d84124f55`, stable range patch ID
`32580e8b03a34f4b4f2b374c78cc8207246a9124`.

That PR had already produced one successful Preview at head
`c5a6ea380a3f7eb97b105895e8b315bfe471df7c`: on the same 2-core/8-GB Vercel
machine class, it reported `Previous build caches not available.`, completed `Running
TypeScript` in 47.191 seconds, became READY, created a 743.92-MB cache and uploaded it.
The final head changed only five `.yml`, `.mjs`, test and JSON paths. A direct Git
comparison proves no change across the checked-in TypeScript include closure,
cross-package TypeScript sources, `package.json`, `apps/web/package.json`,
`pnpm-lock.yaml`, or `apps/web/tsconfig.json`. Its Preview then restored the exact cache
created by the READY deployment, compiled successfully, entered `Running TypeScript`,
emitted no more output, and hit the provider 45-minute maximum.

Exact-head GitHub preparation run `32166438756`, attempt 2, also passed a cold full Next
build and normal TypeScript validation in 5m22s without restoring `.next/cache`. The
source tree therefore has no demonstrated product/type defect. Diagnostic
`IDA-T115-OD17-PROVIDER-DIAGNOSTIC-R1` classifies the remaining cause as restored-cache
or provider-runtime nondeterminism, with provider build-capability exhaustion retained
as a distinct competing hypothesis. Both Vercel observations used the same region and
2-core/8-GB machine class. Vercel documents that Next.js restores `.next/cache/**`, that
failed builds do not update the cache, and that `VERCEL_FORCE_NO_BUILD_CACHE=1` skips
the build cache. The smallest falsifiable next probe is one automatic Preview on the
frozen reviewed tree with that branch-scoped control. It returns the same Vercel machine
class to the closest observed successful cache state; adding CPU/memory variables would
confound that single-variable probe and is not authorized.

## Classification, hypothesis, and measurement

- Classification: Tier 3 shared CI/performance-verification recovery.
- User/operational outcome: prove the already-shipped neutral entry is fast enough to
  unlock exactly one later UI foundation slice without weakening type safety.
- Falsifiable hypothesis: a frozen exact-head automatic Preview with the provider build
  cache disabled completes full Next TypeScript validation and yields one recomputable
  OD#17 verdict within the existing provider maximum.
- Primary measurement: one content-addressed `pass` verdict binding the exact PR head,
  unique Preview deployment, no-cache build evidence, canary run/attempt, Lighthouse
  report, remote JS bodies and Edge TTFB evidence.
- Diagnostic measurement: provider `Running TypeScript` start/completion timestamps;
  this timing is recorded but does not replace an original OD#17 threshold.
- KEEP: exact-head Preview READY, one canary PASS, all three original metrics PASS, all
  required repository gates green, and temporary provider controls removed at closeout.
- REVERT: false pass, head/target ambiguity, token leak, production effect, weakened
  TypeScript validation, or required-gate regression.
- INCONCLUSIVE/terminal abort: an external provider/network failure prevents a normal
  build or canary from executing. Close unmerged as
  `provider_failure / measurement_capability_missing`.
- BUILD-CAPABILITY terminal abort: the no-cache Preview enters the normal TypeScript
  phase but stalls again to the provider ceiling or reports heap/resource exhaustion.
  Close unmerged as `resource / build_capability_exceeded`, not as a product budget or
  provider failure.
- PRODUCT/BUDGET terminal abort: the no-cache Preview completes compile/TypeScript but
  fails deterministically in Next, `apps/web` `check:size`, or another repository-owned
  build step. Close unmerged as `product_defect` or `budget_failed` from the exact failing
  stage; never relabel it as provider failure, measurement-capability missing, or resource
  exhaustion. Raw provider build events are mandatory classification evidence. No
  terminal path permits DG50-R1, another Preview, another canary, or another product head
  in this lifecycle.

## Frozen repository writer map

The implementation may restore and reconcile only the twelve paths already present in
the preserved final reviewed OD#17 tree:

1. `.github/workflows/ci.yml`
2. `.github/workflows/od17-preview-canary.yml`
3. `apps/web/scripts/check-size.mjs`
4. `apps/web/scripts/check-size.test.mjs`
5. `package.json`
6. `scripts/ci/docs-closeout-main-push-contract.test.mjs`
7. `scripts/ci/od17-authenticated-lighthouse.test.mjs`
8. `scripts/ci/od17-public-shell-performance.mjs`
9. `scripts/ci/od17-public-shell-performance.test.mjs`
10. `scripts/ci/workflow-contracts.test.mjs`
11. `scripts/ci/z620-parity.json`
12. `scripts/repo-size-budget.json` only as deterministic metadata required by the
    staged product paths

No thirteenth repository writer is authorized. Reconciliation must preserve the archived
OD#17 behavior while incorporating current-main collector and governance contracts. It
must use the bundle, range-diff/patch-ID evidence, full current file context, and focused
tests; blind cherry-pick conflict acceptance is forbidden.

The already-merged collector contract remains current-main authority. The workflow,
authenticated-Lighthouse implementation/test and lockfile state merged through PRs
`#1589`/`#1592` are diff-must-be-empty unless the archived product behavior cannot be
reconciled without changing one of the two already-authorized writer paths. The
authenticated-Lighthouse implementation and `pnpm-lock.yaml` are outside this map and
therefore immutable. Any non-empty collector diff requires explicit evidence inside the
single consolidated remediation; a new path or behavior terminates this recovery.

The docs-only authority PR may materialize this gate, replace the single compact
current-program/current-tracker selection state, and deterministically sync repository
size metadata. Those authority paths are not product implementation writers.

## Temporary provider controls

After the gate merges and a separate exact-main runtime receipt is approved, runtime may
create only these task-owned Preview controls for branch
`codex/ida-t115-od17-performance-proof`:

1. sensitive Preview/branch-scoped `ENABLE_VERCEL_DEPLOYMENTS=1`;
2. Preview/branch-scoped `VERCEL_FORCE_NO_BUILD_CACHE=1`; and
3. the same exact GitHub Actions Trusted Source tuple previously proven for
   protected-main `.github/workflows/od17-preview-canary.yml` with Preview environment
   and audience exactly `https://github.com/interdomestik`.

Before those controls exist, the branch may be pushed and reviewed only while Vercel is
ignored. After focused proof, one bounded senior review and at most one consolidated
remediation freeze the source tree, runtime creates the three controls and records their
provider IDs/normalized tuples without values. One task-owned empty conventional commit
may then trigger the sole actual automatic Preview; it changes the commit SHA but not the
reviewed Git tree. All required checks, feedback intake, canary evidence and merge bind
that final SHA. No manual redeploy, deployment API call, CLI deploy, build-cache purge,
provider plan/machine change, production target, second actual Preview, or second canary
is authorized.

At terminal PASS or abort, delete only these exact task-owned controls by recorded ID and
tuple, then verify absence while preserving every unrelated provider setting/source.
A PASS closes only the OD#17 measurement; it does not prove whether the prior stall was
caused by restored cache or provider-runtime nondeterminism. Cached-build behavior of the
merged tree remains an explicit residual for ordinary future observation, not permission
for another OD#17 probe.

## Contract closure and cause precedence

1. **Source identity.** Verify the bundle, head, required base, nine commits, range patch
   ID, clean source tree and exact twelve-path set before replay. Reconciled current-main
   output must have one explicit semantic-diff disposition per path. Re-run the no-change
   proof over the complete checked-in TypeScript include/dependency-resolution closure
   for the reconstructed range. The reviewed reconstruction may differ from archived
   `a5c5534`; tree identity is required only between the frozen reviewed commit and its
   deployment-triggering empty commit (`HEAD^{tree} == HEAD~1^{tree}`).
2. **Type safety.** GitHub-hosted Ubuntu must pass exact-head workspace type-check and the
   deterministic preparation build. The Vercel build must run normal Next TypeScript
   validation; `typescript.ignoreBuildErrors`, alternate tsconfig, or skipped validation
   is forbidden. No-cache is isolation, not a type-check waiver.
3. **Head freeze.** Provider controls are created only after the reviewed tree is frozen.
   The sole actual Preview is triggered by a tree-identical empty commit. Any later tree
   mutation invalidates the attempt and terminates this lifecycle rather than authorizing
   another deployment.
4. **Deployment identity.** Exactly one automatic non-production Vercel deployment must
   bind the same-repository open PR, branch exactly
   `codex/ida-t115-od17-performance-proof`, final head and exact OIDC audience. Its raw
   provider log must explicitly report the no-cache/bypass state, normal TypeScript
   start/completion, terminal state and any heap/resource output. It must finish READY
   and expose one immutable provider URL. Zero or multiple valid candidates fail closed.
   The runtime receipt owns export and hashing of these raw Vercel build events before
   the canary; absence of that capture is failure.
5. **Canary identity.** Exactly one protected-main `workflow_dispatch` run must bind the
   final PR/head, unique deployment/status IDs, preparation run/attempt/artifact digest,
   trusted-main workflow SHA and content-addressed raw evidence. Ambiguity fails before
   metric evaluation.
6. **Metric truth.** The audit independently recomputes the remote SQ/MK/EN first-party JS
   closure, Lighthouse mobile report and exact-content attributable Edge TTFB. All three
   original strict thresholds are mandatory; local build bytes are diagnostic only.
7. **Failure precedence.** Invalid capability/evidence identity is classified before head,
   target and budget evaluation. Provider/network failure never becomes a product budget
   failure or green skip. A second no-cache TypeScript-phase stall is classified separately
   as `build_capability_exceeded`; a deterministic post-TypeScript Next or `check:size`
   failure is `product_defect`/`budget_failed`. Raw Vercel build events are retained in
   every outcome.

## Acceptance matrix

| Criterion                         | Evidence                                                                   | Required result                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Preserved implementation identity | bundle verify, path set, commit list, stable patch ID and range-diff       | exact final reviewed implementation is recovered; every current-main reconciliation is explicit                    |
| Cache hypothesis isolation        | both prior cache events, provider control receipt and new raw build events | prior READY build starts cacheless and creates the restored cache; new exact-branch Preview explicitly bypasses it |
| Focused source proof              | existing OD17 controller, check-size, Lighthouse and parsed workflow tests | all adversarial identity, fork, token, remote-body, metric and failure-class cases pass                            |
| Pre-provider proof                | exact-head GitHub Ubuntu type-check and preparation build                  | unchanged full type safety/build closure pass before the sole actual Preview                                       |
| Exact environment                 | one automatic Preview plus one protected-main canary                       | unique exact-head non-production deployment READY; one canary produces complete raw evidence                       |
| OD#17 budgets                     | exact-head PR audit recomputation                                          | Lighthouse >90, max remote JS <122,880 gzip bytes, Edge TTFB <100 ms                                               |
| Regression authority              | exactly one final-head PR E2E plus required checks                         | CI, Sonar, CodeQL, gitleaks/audit/security, finalizer and current-head feedback are green                          |
| Cleanup                           | provider absence checks, clean synced main, branch/worktree hygiene        | exact temporary controls and task refs are gone; unrelated state and preserved stash remain                        |

Skipped required evidence is failure. Focused proof precedes provider work. Rerun only an
invalidated check; provider Preview and canary are each single-attempt in this lifecycle.
The successful preparation artifact has one-day retention. After a successful artifact
upload, the preparation workflow must not be rerun because a duplicate same-name artifact
would invalidate the exact-selection contract; a failed attempt before upload may be
recovered only if the final runtime receipt still permits it.

## Highest-risk cases

1. A no-cache flag is absent/mis-scoped and the same branch cache is silently reused.
2. TypeScript validation is weakened to make the provider build green.
3. An early Preview is consumed after the source tree changes.
4. A fork, wrong head, mutable alias, duplicate deployment, production target or stale
   artifact is accepted.
5. OIDC reaches a third-party origin or appears in logs/artifacts.
6. Provider timeout is mislabeled as a product budget failure or retried indefinitely.
7. Temporary provider controls survive closeout or an unrelated source is deleted.
8. A repeated TypeScript-phase stall is mislabeled as an external provider failure rather
   than `build_capability_exceeded`.

## Focused and mandatory gates

Focused proof uses the existing OD17/check-size/authenticated-Lighthouse/workflow contract
suites, `git diff --check`, Prettier, modularity guard, repo-size check, deterministic
parity check, and exact archived-path reconciliation. Stage only intended paths before
size sync.

The final current head must pass `pnpm pr:verify`, `pnpm security:guard`, and
`pnpm e2e:gate`; GitHub-hosted Ubuntu supplies exactly one completed full exact-head PR
E2E. Sonar, CodeQL, gitleaks, pnpm audit, current-head Copilot/Codex feedback, zero
unresolved threads and `pr-finalizer` remain mandatory. Codex Security diff scan remains
waived by explicit user instruction; repository-native security is not waived.

## Reviewer and remediation ceiling

Use one bounded Tier 3 senior review on the complete reconciled tree: Opus 5 if available,
otherwise GPT-5.6 Sol Ultra. Retain one process and timer; never resend the same review.
Apply at most one consolidated remediation and one current-tree re-review. A new writer,
provider primitive, metric, threshold, auth/routing/tenant surface, or second independent
failure requires terminal abort, not DG50-R1/A1 scope growth.

The pre-approval Opus 5 review ran once for 420.798 seconds and returned `REVISE`. This
single consolidated remediation records the prior READY/cache-created evidence, exact
cold-build evidence, competing build-capability class, branch/audience binding, complete
type-input closure, reconstruction tree-identity boundary, collector diff ceiling and
mandatory raw cache/build-event capture. No second independent remediation is permitted.

The exact-artifact Opus 5 re-review ran once for 433.288 seconds and returned `REVISE`
with one P1 classification gap and bounded P2/P3 declaration corrections. The final
candidate addresses them without changing the outcome, writer map, provider primitives,
metrics, thresholds or single-attempt ceiling. No final model `PASS` is claimed and no
further model loop is permitted.

## Rollout, rollback, and disk/resource boundary

Mac remains control plane/light writer with no Docker/Supabase or local full build. Use the
existing dependency runtime without duplicate installs. GitHub-hosted Ubuntu owns
type-check, preparation, exact-head E2E and required CI. Z620 remains unused unless a
freshly discovered exact-environment need is separately authorized; it cannot prove the
Vercel Edge result.

Rollback before merge: close the PR unmerged, preserve the exact head in a verified bundle,
delete only task-owned provider controls/branch/worktree and restore compact authority to
`blocked_requires_current_authority`. Rollback after merge: revert the single implementation
merge, leaving P0A/P0B intact. No production release, alias, data, schema, provider plan,
cache purge, or irreversible cleanup is authorized.

## Runtime authority and stop conditions

This document grants no branch, worktree, provider write, deployment, canary, code mutation
or runtime authority. After docs-only merge, resolver and scorecard must select exactly
`IDA-T115-OD17-PUBLIC-SHELL-PERFORMANCE-PROOF`; a separate content-addressed runtime
receipt must bind then-current main, this gate, the preserved bundle, diagnostic receipt,
provider-control tuple, source-freeze sequence, disk state and single-attempt ceiling.

Stop before implementation for any disagreement in main/program/tracker/resolver, bundle
identity, admission, source path set, provider tuple or runtime receipt. After implementation
starts, stop terminally—without another R/addendum—if the source tree needs a thirteenth
writer, if the sole actual Preview or canary fails, or if proof requires manual/production
deployment, long-lived bypass credentials, weakened TypeScript, a changed threshold, or a
second product slice.

## Follow-on boundary

Only an actual merged and closed OD#17 PASS permits a fresh authority selection for exactly
one of `T-118` or `T-117`. This gate promotes neither.
