# IDA-DG52 — OD17 attested prebuilt Preview capability and successor measurement

Status: exact candidate; no repository, branch, PR, GitHub environment, provider,
credential, deployment, runtime, or successor authority exists until Arben approves the
final content-addressed gate and its passing admission receipt.

Base protected main: `cb33cd616abcb79c4298c1024d592d8ae998c1cc`.

Gate ID: `IDA-DG52-OD17-ATTESTED-PREBUILT-PREVIEW-R1`.

Successor capability slice: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY`.

Successor runtime result: `IDA-OD17-ATTESTED-PREBUILT-PREVIEW`.

## Decision

Create one reusable protected-main measurement lane that removes Vercel source builds
from the OD17 trust path:

1. GitHub-hosted Ubuntu builds `.vercel/output` from one exact protected-main commit
   without Vercel, database, authentication, deployment, or OIDC secrets;
2. a separate trusted-main job reconstructs the artifact, rejects unsafe filesystem
   entries, recomputes its canonical manifest and archive digests, and creates a GitHub
   artifact attestation;
3. after a secretless predecessor verifies the attestation, a protected-environment
   deploy-only job independently extracts and re-verifies the attested file set; only its
   final constant upload step injects `VERCEL_TOKEN` and uploads that exact file set once
   with `vercel deploy --prebuilt --target=preview`; it performs no build, project install,
   pull, alias, promotion, or Production operation;
4. a separate tokenless measurement job uses only a narrowly scoped Vercel Trusted
   Source OIDC token to verify served provenance and measure `/sq`, `/mk`, and `/en`;
5. an independent verifier recomputes the remote JavaScript closure and the existing
   OD17 thresholds from content-addressed evidence.

The single runtime deployment first proves identity, protection, health, and served
provenance and then, on that same immutable deployment, performs the performance
measurement. Qualification and measurement are sequential gates in one run, not two
deployments. Vercel performs no source build or TypeScript compilation.

This is a new successor environment and result. It is not a T-115 retry, amendment,
reopening, or relabel. It does not reuse DG51 runtime authority.

## Immutable historical input

T-115 remains terminal at protected main
`cb33cd616abcb79c4298c1024d592d8ae998c1cc`:

- P0A and P0B are complete;
- OD17 is `INCONCLUSIVE — measurement_capability_missing/provider_failure`;
- its sole frozen runtime head was
  `3a9689b94cb9a353ab2db8435d32ac5e8534123f`;
- Vercel deployment `dpl_DH8E1oGWTsf8s4xi2Mg6i7Ck87Wx` ended
  `BUILD_EXCEEDED_MAXIMUM_TIME` after approximately 46 minutes and never reached READY;
- GitHub Deployment `5987940626` / status `17029471770` recorded failure;
- no measurement PR, preparation, canary, metric, audit rerun, finalizer rerun, or
  measurement merge occurred;
- all task provider controls were rolled back, `deployment_status Events=OFF`,
  `repository_dispatch Events=OFF`, and Standard Protection remains ON;
- final closeout PR #1601 merged as
  `cb33cd616abcb79c4298c1024d592d8ae998c1cc`, with exact-main security, CodeQL, and
  Sonar health green and its automatic CD contained before any step executed;
- the resolver is `blocked_requires_current_authority`, `activeSlice=null`.

The old DG51 capability remains useful historical code evidence but cannot authorize or
certify this successor. Old Preview, GitHub Deployment, canary, PR, review, and check
records are never reused as current evidence.

## Why this is the permanent architecture

The prior design coupled three independent concerns: the provider source build, the
provider-to-GitHub deployment projection, and the performance measurement. Any failure
in the first two prevented the third. The new design makes the build artifact the trust
root and treats Vercel only as a Preview runtime and Edge delivery target.

The result no longer depends on:

- Vercel's 45-minute source-build cap;
- Vercel TypeScript build behavior;
- automatic Git integration;
- `deployment_status Events` or `repository_dispatch Events`;
- a Vercel-bot GitHub Deployment record, branch-valued deployment ref, app slug, or
  guessed hostname prefix;
- an empty trigger commit or measurement PR;
- PR-controlled executable code receiving Vercel, database, auth, or OIDC credentials.

The repository already proves the architectural primitive in its staging CD: it can
build `.vercel/output`, hash it, attest it, upload with `--prebuilt`, and verify served
metadata. DG52 creates an isolated Preview-only implementation. It must not invoke or
modify the staging/production composite because that path is coupled to Docker image
digests, real environment pulls, aliases, self-hosted runners, and `vercel@latest`.

## Risk and admission boundary

The gate/promotion decision is Tier 0. The capability implementation and runtime are
Tier 3 because they add CI, artifact-attestation, deployment, environment-protection,
secret, OIDC, and performance-proof trust boundaries.

The version-1 slice-admission receipt applies only to the inert capability PR. It must
be `ready` before authority promotion and has:

- one product outcome: install the protected-main attested-prebuilt Preview capability;
- at most eleven implementation writer paths;
- exactly three proof surfaces;
- one shared runtime consumer;
- zero pre-implementation special environments, because the capability PR performs no
  provider operation;
- one first RED action: the focused workflow/trust-boundary contract;
- invalidated-only reruns and one full CI/E2E authority per exact PR head.

Provider execution is a later exact-main R2 boundary. The absence of a pre-existing
provider canary is not converted into invented admission evidence.

## Four isolated trust zones

### Z1 — secretless protected-main build

The workflow is `workflow_dispatch` only and runs only when repository, workflow path,
`refs/heads/main`, approved actor ID, requested SHA, `github.sha`, and live protected
main are equal. `run_attempt` must be 1 and no prior result/deployment receipt may exist
for that exact source.

Z1 checks out only the approved protected-main SHA with persisted credentials disabled.
It runs on GitHub-hosted Linux x64 with recorded runner image, Node, pnpm, lockfile, and
exact Vercel CLI identities. It has `contents: read`, `id-token: none`, no GitHub
environment, no Vercel token, no database/auth/provider secret, and no writable cache.

It constructs `.vercel/project.json` from a committed sanitized project-settings snapshot
and the approved non-secret team/project IDs. That snapshot is captured read-only during
R1, contains only build-relevant non-secret settings, and is bound by hash; Z3 re-reads
the live allowlisted settings before upload and requires equality. This replaces, rather
than silently emulates, the settings portion normally written by `vercel pull`.

Z1 performs a Preview-target build with exactly these inert, non-secret inputs:

- `CI=1` and `NEXT_TELEMETRY_DISABLED=1`;
- `NEXT_PUBLIC_APP_URL=https://od17-build.invalid`;
- `BETTER_AUTH_URL=https://od17-build.invalid`;
- fixed non-secret build-only `BETTER_AUTH_SECRET` of at least 32 characters;
- `DATABASE_URL=postgresql://unused@127.0.0.1:1/unused`;
- `DATABASE_URL_RLS=postgresql://unused-rls@127.0.0.1:1/unused`.

It never runs `vercel pull`, imports a live `.env` file, or synthesizes Vercel System
Environment Variables. A source/fixture contract proves the measured public shell does
not change or disappear under these inert private inputs and that build-time code does
not depend on `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV`, or `VERCEL_GIT_*`. The
capability may not be called ready until this exact GitHub-hosted build succeeds without
a Vercel credential, environment pull, or deployment mutation.

Any need for a live secret during build is `product_defect`, not permission to move a
secret into Z1.

### Z2 — trusted reconstruction and attestation

Z2 checks out the same protected-main SHA and receives no Vercel, DB, auth, or protection
secret. It downloads only the exact Z1 artifact from the same workflow run/attempt and
validates the server artifact ID and digest.

Before attestation it rejects symlinks, hard links, devices, FIFOs, sockets, absolute or
traversal paths, backslashes, NUL, case/Unicode collisions, unexpected owners/modes,
duplicate paths, excess file count, per-file size, and total size. Paths are byte-sorted.
It recomputes every file digest and a canonical payload manifest. The payload digest
excludes only the subsequently written served-metadata path to avoid self-reference. It
writes served metadata containing schema, repository, source commit/tree, protected-main workflow
path/ref, run/attempt, project/team, exact toolchain, build-command hash, environment-key
allowlist hash, and payload digest; no secret value or raw environment file is retained.

It then creates a deterministic final archive that includes and therefore hashes the
served metadata and computes a final archive digest. The GitHub attestation subject is that final digest and
its predicate binds the payload digest, source commit/tree, workflow/run/attempt, exact
Z1 artifact identity, toolchain, project/team, and Preview target. Only Z2 has
`id-token: write` and `attestations: write` before deployment.

### Z3 — protected deploy-only uploader

Z2 must finish secretless attestation verification before Z3 can be scheduled. Z3 declares
the protected `Preview` GitHub environment with `deployment: false` at job level, so its
required human approval occurs before the job starts. It starts in a fresh workspace,
checks out only trusted protected-main control code, and does not run project install,
package scripts, build output, or any local composite that can build. It downloads the
exact final archive, verifies its GitHub attestation against the exact repository,
`refs/heads/main`, source SHA, signer workflow, run/attempt, and subject digest, extracts
it into an empty directory, and re-validates the exact file set. Its permissions are
`contents/actions: read`, `id-token: none`, and `attestations: none`.

Within the DG52 workflow, `VERCEL_TOKEN` is referenced and injected only as step-scoped
environment for Z3's final constant upload step, after the in-job verification gates have
passed; no earlier step receives it. The required environment approval necessarily
precedes the job. The existing repository-scoped credential is also an
independent consumer of production/staging CD and is demonstrably capable of broader
Production and alias operations; DG52 does not call it Preview-scoped or least-privileged.
The job binds
`VERCEL_ORG_ID=team_zZnOjQLylAZArqxcUhLbHDHc` and
`VERCEL_PROJECT_ID=prj_K0HT5WpYJUloEmRppA4CBfoY8KtJ`. The runtime receipt must record
the token's observable team scope without disclosing its value. Preview confinement is
enforced by the fixed argument vector, deploy-only controller, contract rejection of
Production/alias commands, the environment stop-and-confirm, and post-deploy target and
alias verification—not by credential scope.

The only permitted provider mutation is one invocation equivalent to:

`vercel deploy --yes --prebuilt --archive=tgz --target=preview`

using `vercel@59.1.4`, registry integrity
`sha512-oLctNaFB5bptskV4gioZQ6Ac4E0fDbKKU/q/JX1H+lz7IWgsTgKafwxvfJHJiCANEH5syl7a9H1IxxGN7Dp8dg==`.
An isolated checked-in npm lock pins every transitive package integrity; installation is
`npm ci --ignore-scripts` in runner temp and the controller verifies the installed CLI
version before use. The workspace package manifest and pnpm lock stay unchanged.
Constant Git metadata may
bind repository, ref, source SHA, and project on the Vercel side but is not treated as a
GitHub Deployment guarantee. `--prod`, build, pull, env mutation, alias, promote, custom
domain, redeploy, rollback deploy, and a second invocation are rejected by contracts.

Z3 captures a sanitized receipt with exact provider deployment ID, deployment-specific
HTTPS root URL, project/team, resolved Preview target, `production=false`, READY state,
aliases, source metadata, payload/final digests, workflow/run/attempt, start/end, and
bounded provider output. It uploads exactly one GitHub artifact; contents and secret
patterns are checked before upload. GitHub Deployment/status delta is expected to be
zero for the CLI path and is evidence, not a required identity bridge.

### Z4 — tokenless provenance, health, measurement, and verification

Z4 has no Vercel token, DB/auth secret, project environment secret, or deploy permission.
It may receive only `contents/actions: read` and narrowly scoped `id-token: write` for the
approved Vercel Trusted Source. The OIDC audience remains
`https://github.com/interdomestik`; the token is sent only to the exact immutable Vercel
origin as `x-vercel-trusted-oidc-idp-token`, never persisted or uploaded.

Before any measured-locale fetch, Z4 independently reselects the exact same-run build and deploy
artifacts, verifies their GitHub digests and attestation, validates the provider receipt,
fetches `/.well-known/interdomestik-release-attestation.json`, and requires its exact
source commit/tree, project/team, payload digest, workflow, and run identity. It requires
one canonical deployment-specific HTTPS root URL, Preview/non-production, READY, no
Production/custom-domain alias delta, unauthenticated protection, authenticated 200
health only on non-measured surfaces such as the served metadata or a dedicated health
endpoint. It must not fetch `/sq`, `/mk`, `/en`, or their JavaScript before measurement.

For each locale, the first authenticated exact-content request is the TTFB sample. Only
after that sample may the collector fetch the locale again, run mobile Lighthouse, and
derive and fetch its exact served JavaScript closure, preserving the established ordering.
The independent verifier re-downloads raw evidence, reconstructs every remote
body/digest/gzip count, requires the exact local attested counterpart, and recomputes the
verdict. The thresholds and timing method remain:

- every locale performance score `> 90`;
- every locale deployed initial JavaScript total `< 122880` gzip bytes;
- every locale first authenticated exact-content Edge TTFB `< 100 ms`.

No warmed second request, mutable alias, local bundle estimate, manufactured metric, or
provider-internal assertion can satisfy the result.

## Exact capability implementation writer map

The capability PR's semantic implementation diff may change only these eleven paths:

1. `.github/workflows/od17-attested-prebuilt-preview.yml` — new;
2. `scripts/ci/od17-prebuilt-archive.mjs` — new canonical archive/manifest validator;
3. `scripts/ci/od17-prebuilt-deployment.mjs` — new identity/receipt/CLI controller;
4. `scripts/ci/od17-prebuilt-deployment.test.mjs` — new archive, deployment, static
   workflow, permission, pinning, secret-zone, and one-shot contract; it must also import
   `../../apps/web/scripts/check-size-prebuilt.test.mjs`, and assert that import exists;
5. `scripts/ci/od17-prebuilt-lighthouse.mjs` — new isolated collector;
6. `scripts/ci/od17-prebuilt-lighthouse.test.mjs` — new;
7. `apps/web/scripts/check-size-prebuilt.mjs` — new independent verifier;
8. `apps/web/scripts/check-size-prebuilt.test.mjs` — new, executed through writer 4;
9. `scripts/ci/od17-vercel-cli-lock.json` — new isolated npm lock for
   `vercel@59.1.4` and every transitive integrity;
10. `scripts/ci/od17-vercel-project-settings.json` — new sanitized, allowlisted,
    content-addressed non-secret project-settings snapshot;
11. `scripts/repo-size-budget.json` — unchanged-generator deterministic reconciliation
    for the new tracked files/bytes only.

After exact R1 approval, that same capability PR must also add the stable governance
receipt
`docs/plans/2026-08-19-ida-od17-attested-prebuilt-preview-capability-runtime-r1.md`
and compactly update `docs/plans/current-program.md` and
`docs/plans/current-tracker.md` to `active_implementation` with
`runtime_authorized:true` under R1's implementation-only scope. These three governance
writers are outside the eleven semantic implementation writers and may contain no code,
threshold, provider-runtime, or writer-map expansion. No other path may change;
`scripts/repo-size-budget.json` remains the sole deterministic size-metadata writer.

Every new production file, test, and workflow remains at or below 150 physical lines.
There is no exception under this gate.

No existing near-150-line OD17 collector/verifier, `workflow-contracts.test.mjs`,
`ci.yml`, workspace `package.json`/`pnpm-lock.yaml`, setup action, CD workflow,
staging/production deploy action, or product source may change under this map. If exact
implementation proves a twelfth path indispensable, stop and re-run admission before
writing it. A thirteenth semantic writer or a second shared consumer requires a split.

## Proof surfaces and invalidation

### S1 — offline contracts and exact-head capability PR

Focused dependency-free tests cover:

- repo/ref/SHA/tree/run/attempt/actor drift and replay;
- secret-zone permissions and absence of `pull_request_target`, privileged `workflow_run`,
  PR checkout, candidate local action, mutable `uses`, `@latest`, build in Z3, or OIDC in
  Z1/Z3;
- fixed CLI and deploy arguments;
- artifact add/remove/mutate/rename, links/special files, traversal, path collisions,
  archive bombs, size limits, manifest/archive/attestation mismatch;
- wrong signer repo/workflow/ref/SHA/tree/run/attempt/artifact/predicate and replay;
- wrong provider project/team/target/state/ID/URL/source metadata, duplicate/zero
  deployments, Production/custom alias drift, protection bypass leakage, and secret-like
  evidence;
- remote JavaScript closure, body/digest/gzip recomputation, locale redirects, OIDC origin
  confinement, and unchanged thresholds.

The capability PR then requires exact-head format, modularity, security, gitleaks, audit,
static, unit, CodeQL, Sonar, CI E2E gate, one PR E2E, Pilot, feedback, and finalizer.
Vercel Git Preview remains intentionally skipped; no provider action occurs.

Any implementation writer, toolchain/pin, workflow permission/event, test, base/head,
or actionable feedback change invalidates S1. Only invalidated proof reruns.

### S2 — exact-main runtime admission and artifact/deployment qualification

After the capability merges and exact main is healthy, R2 binds every capability blob,
the live protected-main SHA/tree, environment/provider preimages, CLI version/integrity,
actor, one run/attempt, one artifact chain, one deploy invocation, and one deployment.
Within the sole run, Z1-Z4 identity, attestation, READY, protection, non-locale health,
served metadata, and alias checks must pass before the first locale request. Remote/local
JavaScript closure completes only after each locale's first-request TTFB sample and before
the verdict.

Any main, workflow/helper blob, runner image/architecture, CLI, project/team, GitHub
environment, Trusted Source, protection, artifact, digest, attestation, deployment, URL,
or provider configuration change invalidates S2 and stops before measurement. It does
not authorize a second dispatch or deployment.

### S3 — final measurement and independent verdict

S3 is the measurement portion of the same S2-qualified deployment. It produces exactly
one bounded `od17-attested-preview-<mainSha>` evidence artifact containing raw evidence,
sanitized receipts, manifest, attestation identity, and independent verdict. Artifact
identity is server-issued and content-addressed.

Any locale/body/request closure, Chrome/Lighthouse/Node/zlib version, timing method,
threshold, evidence schema, input artifact, deployment, source main, or verifier change
invalidates S3. There is no measurement retry on the same or another deployment.

## Governed sequence

### Phase A — authority convergence

After exact approval, merge one inert authority PR containing this gate, its passing
v1 admission receipt, compact current-program/current-tracker promotion, and
`scripts/repo-size-budget.json` only if the unchanged deterministic generator requires
reconciliation after staging those authority documents. It promotes only
`IDA-OD17-ATTESTED-PREBUILT-PREVIEW-CAPABILITY` to `awaiting_runtime_authority`.
It does not authorize implementation or provider runtime. Contain that merge's automatic
CD before any step and verify exact-main health.

### Phase B — inert capability implementation

On exact authority main, one content-addressed R1 implementation receipt is the first
remaining human approval. It authorizes one clean writer/worktree, one branch/PR, the
eleven semantic implementation paths plus the three exact governance writers above,
focused-first proof, exact-head feedback once, and no provider or GitHub-environment
mutation. The PR's first governed state binds the stable R1 receipt and makes the
canonical resolver `active_implementation` / `runtime_authorized:true` before any
implementation writer is exercised. Merge only the exact reviewed head, contain
automatic CD before steps, verify exact main and required health, then clean only its
branch/worktree. R1 authorizes repository implementation only; provider execution remains
forbidden until R2.

### Phase C — one-shot successor runtime

Only after capability main is exact and healthy may one content-addressed R2 be created.
It is the second and last strategic human approval. It binds exact main/tree/blobs,
actor, workflow, CLI integrity, GitHub `Preview` environment preimage and desired
temporary protection, Vercel team/project/token observable scope, Standard Protection,
exact Trusted Source tuple, counters, artifact names, cleanup, and terminal closeout.

R2 may temporarily configure only:

- GitHub `Preview` environment: required reviewer Arben, protected-main-only deployment
  branch policy, admin bypass disabled where supported, `deployment: false`;
- one Vercel Trusted Source for exact repository, `refs/heads/main`, exact successor
  workflow, audience `https://github.com/interdomestik`, environment `preview`.

It does not turn on Vercel `deployment_status` or `repository_dispatch`, does not add
project variables, and does not enable automatic Git builds. Preimages and normalized
server identities are recorded before mutation and restored after the first terminal
run. Arben is both approved dispatcher and reviewer, so this is an explicit human
stop-and-confirm, not separation of duties. Environment approval enforces R2; it is not
a third strategy approval. The receipt records which bypass controls GitHub actually
exposes instead of assuming an unavailable setting.

Immediately before dispatch, require exact main and clean capability blobs, one eligible
actor, run count zero, deployment-receipt count zero, exact provider/environment controls,
Standard Protection ON, and no automatic Git Preview for the runtime SHA. Dispatch once
on `refs/heads/main`. `run_attempt` must remain 1. Same-deployment bounded READY polling
is observation; rerun, re-dispatch, redeploy, alternate URL, manual provider build, or a
second canary is forbidden.

### Phase D — preauthorized terminal closeout

The first terminal outcome fixes the disposition. R2 preauthorizes one closeout branch
and PR changing only:

- one stable sanitized successor terminal-evidence document;
- `docs/plans/current-program.md`;
- `docs/plans/current-tracker.md`;
- `scripts/repo-size-budget.json` only if the unchanged deterministic generator requires
  it after staging those three documents.

On candidate PASS, closeout occurs only after the complete evidence artifact and
independent verifier PASS. On non-PASS, it records the exact stage and retained evidence
without manufacturing metrics. Restore the GitHub environment and Vercel Trusted Source
preimages first, retain the immutable deployment history, then merge the exact reviewed
docs head. Contain closeout CD before steps, verify final origin/main and health, remove
only successor refs/worktrees/temp state, and end `runtime_authorized:false` with no
active implementation slice. No R3, gate amendment, or extra human approval is created
for a result already defined here.

## Terminal classifications

`PASS` requires all of the following: exact approved protected main; Z1 secretless build;
Z2 canonical validation and verified attestation; exactly one upload of the revalidated
attested file set;
one READY immutable Preview in the exact project/team with `production=false`; no
Production/custom alias delta; exact served provenance and local/remote JS closure;
all three threshold sets passing; one content-addressed evidence artifact; independent
verifier PASS; provider/environment restoration; merged terminal closeout; exact-main
health and cleanup.

`budget_failed` means a valid measurement executed and one or more unchanged performance
thresholds failed.

`product_defect` means trusted repository-owned build, archive, collector, or verifier
logic failed deterministically after all required environment capabilities were valid.

`INCONCLUSIVE — measurement_capability_missing/provider_failure` applies only after the
pre-dispatch authority/configuration admission passed and the sole run began. It means
provider auth/configuration could not then be used, the upload/protection/network
operation was unavailable or rejected, no deployment record was returned, or one
otherwise identity-valid deployment failed to reach READY before valid metrics.

`INCONCLUSIVE — execution_environment_failure` means GitHub-hosted runner, package
network, resource, Chrome, or pinned toolchain capability failed before valid metrics.

`INCONCLUSIVE — integrity_failure` applies only after the pre-dispatch authority admission
passed. It means a returned record or artifact exists but any non-authority
main/tree/blob, artifact, digest, attestation, project/team/target, deployment URL,
served provenance, alias, duplicate, replay, or identity predicate failed.

`NOT_RUN — authority_drift` has exclusive precedence if main, approved authority, or any
approved configuration drifts before the first provider mutation/upload call, including
drift found by the dispatched run's final admission check. No provider operation occurs.
R2 is consumed and closeout records the drift; this gate does not silently issue a
replacement receipt.

Every classification is terminal for this successor version: rollback/restore, one
closeout, no retry. A later attempt or environment requires a new strategic decision.

## Forward dependency semantics

T-115 remains historical: P0A and P0B are complete and OD17 is terminal INCONCLUSIVE.
For forward dependency resolution only, define:

`OD17_READY := T115_P0A_PASS ∧ T115_P0B_PASS ∧ IDA-OD17-ATTESTED-PREBUILT-PREVIEW:PASS`.

A merged DG52 terminal closeout with PASS is the sole witness for `OD17_READY`. It does
not relabel, reopen, or complete historical T-115.

When `OD17_READY` is true, T-118 and T-117 become eligible, never automatically
promoted, for fresh gates. T-118 must preserve and reprove OD17 on its changed head.
T-116 remains ineligible until T-103 and T-118 are complete. No T-117→T-116 dependency
is invented.

## Rollback and containment

Before implementation, rollback is deletion of only the unmerged capability branch and
worktree. After capability merge, rollback is a separately reviewed exact revert if the
merged inert capability causes a current-main regression; provider runtime remains
forbidden until main is healthy again.

During R2, any partial, broader, missing, unreadable, or ambiguous GitHub/provider control
set restores the exact preimage and stops before dispatch. After dispatch, the first
terminal state restores only task-owned controls by server identity/full tuple. Standard
Protection stays ON, `deployment_status` and `repository_dispatch` stay OFF, unrelated
controls remain untouched, and deployment history is retained. No Production/staging
deployment or alias exists to roll back.

Every main merge in Phases A, B, and D has its exact automatic CD run cancelled before
any executable step, then re-read terminal. No unrelated run is cancelled.

## Explicit non-goals

- no T-115 retry, reopening, relabel, old branch, DG51 amendment, or old evidence reuse;
- no automatic Vercel Git Preview, Vercel source build, provider TypeScript build,
  GitHub Deployment/status bridge, empty trigger commit, or measurement PR;
- no Production/staging target, alias, promotion, custom domain, deploy hook, rollback
  deployment, second dispatch, rerun, redeploy, or alternate provider;
- no modification or invocation of the existing staging/production CD workflow/action;
- no PR/fork-controlled executable byte with Vercel, DB, auth, OIDC, or environment
  credentials;
- no real DB/auth secret in build/sign/measure jobs and no Vercel token outside Z3;
- no product, UI, route, proxy, auth/session, tenant, schema/RLS, billing, workspace
  dependency/lockfile, performance threshold, timing method, or architecture-history
  change; the isolated Vercel CLI lock in the writer map is the sole dependency metadata;
- no local dependency install, build, Docker, Supabase, E2E, cache, or heavy proof;
- no AI OS/Brain maintenance, tracker expansion, CI refactor, T-118/T-117/T-116
  implementation, or automatic successor promotion;
- no credential creation/rotation, provider plan/machine/team/project change, or claim
  about undocumented provider internals under this gate.

## External facts used

- Vercel documents that `deploy --prebuilt` uploads existing `.vercel/output` without a
  provider build and that prebuilt builds do not receive Vercel System Environment
  Variables automatically.
- Vercel documents generated deployment URLs as deployment-specific while aliases are
  moving pointers.
- GitHub documents artifact-attestation verification and protected environments;
  `environment: { deployment: false }` avoids an unrelated GitHub Deployment record.
- A read-only repository inspection found `VERCEL_TOKEN` at repository scope, existing
  non-secret org/project identity, an unprotected `Preview` GitHub environment, and no
  successor environment. No secret value was read.
- A historical staging CD run proves the repository can upload and verify a prebuilt
  Vercel output, but it used a different trust boundary and is diagnostic only.

## Opus 5 review and disposition

The bounded `opus-5-priority-read-grep` route ran once over the complete ignored/redacted
packet `dg52-opus5.txt`: 37,757 bytes, SHA-256
`9bc8d9ebb79a97801a7637074e510c897c3ec2ba10acfdd7780c86f19205853d`,
elapsed 418.830 seconds, no timeout, exit 0. Verdict: `REVISE`.

The review explicitly found the architecture sound, confirmed that one immutable
deployment is sufficient for sequential qualification and measurement, confirmed that
protected-main-only execution removes PR/fork secret exposure, found no digest-chain
mutation gap, accepted pure-CLI zero-GitHub-Deployment semantics, and agreed that isolated
parallel files are required because the historical OD17 and production-CD files are at
their line/trust limits.

Accepted blockers and consolidated corrections:

1. The original map could not implement a lockfile-integrity CLI pin. The final map uses
   `vercel@59.1.4`, pins the published top-level SHA-512, adds one isolated transitive npm
   lock, verifies the installed version, and leaves the workspace lock unchanged.
2. Pre-fetching measured locale pages or their JS would warm the first-request TTFB and
   permit a false PASS. Final ordering qualifies only non-measured surfaces first; each
   locale's first authenticated request is the TTFB sample, then Lighthouse/closure run.
3. The existing repository Vercel credential is demonstrably broader than Preview-only.
   Final text states that residual privilege plainly and enforces Preview through code,
   environment stop-and-confirm, target/alias postconditions, and no scope fiction.
4. The proposed 200-line test escape did not exist. Every new code/test/workflow file is
   now unconditionally at or below 150 lines.
5. The verifier test under `apps/web/scripts` would be orphaned. The in-glob deployment
   contract test must import it and assert that import, while also owning compact archive
   and workflow contracts.

The review's sixth claimed blocker was rejected as a packet-redaction artifact. The
redactor conservatively replaced the values after `id-token:` in the review copy. The
actual candidate under review already contained literal, balanced `id-token: none` for
Z1, literal `id-token: write` for Z2/Z4, and the final candidate explicitly gives Z3
`id-token: none`. No gate ambiguity existed,
but the final candidate is re-hashed independently from the redacted packet.

Accepted hardening:

- payload digest exclusion of only served metadata and final-archive inclusion are now
  explicit;
- Z3 extracts the verified archive and uploads the exact revalidated file set, rather
  than claiming Vercel CLI uploads the external tarball byte-for-byte;
- Arben's environment approval is named as self stop-and-confirm, not separation of duty;
- inert Z1 build variables and the sanitized project-settings snapshot are predeclared;
- token confinement is qualified as within DG52 because production CD remains an
  independent consumer;
- deterministic repository-size reconciliation is an explicit implementation writer.

The suggestion that no repository-size generator exists was rejected: current main has
`scripts/repo-size-budget-sync.mjs` and its focused contract. The final map uses that
unchanged generator only for deterministic actual ceilings.

Three independent read-only audits separately checked governance/dependencies,
provider/CLI semantics, and the artifact/security topology. Their accepted conclusions
are reflected in the final phase, trust-zone, writer, terminal, and forward-dependency
contracts. The final candidate and updated v1 admission receipt must now be re-hashed,
the admission checker rerun, and the exact bytes independently audited before one human
approval hold.
