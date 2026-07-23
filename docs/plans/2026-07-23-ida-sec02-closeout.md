# IDA-SEC02 closeout — confidential health-poller diagnostics

## Outcome

`IDA-SEC02` is complete. The shared Vercel health poller now emits only fixed,
allowlisted attempt, success and failure diagnostics. Raw URLs, query strings,
userinfo, response bodies and arbitrary error payloads do not cross log, CLI or
terminal thrown-diagnostic boundaries.

Polling order, retry count, inter-attempt sleep, provenance validation, success
body return for imported callers and hard-red terminal failure remain intact.
No provider, alias, environment, deployment, production or database action was
performed by this slice.

## Authority and merge

- Canonical gate `IDA-SEC-DG02` R0: 10,808 UTF-8 bytes, SHA-256
  `c03eb9882810d513cd786541f82b485b3e1bd1d25a77bb13831d1f146b43eccd`.
- Runtime-authority receipt: 7,106 UTF-8 bytes, SHA-256
  `1a5e7bb5b5b07bb22e215ddceef345f8b5f2eab6806a0ac8341b7036654b3e3a`.
- Exact implementation base:
  `d2ea5cd7e7f04dac7938b69077fcfc9e1af9b3e3`.
- Implementation PR: [#1418](https://github.com/interdomestik/interdomestik/pull/1418).
- Final implementation head:
  `56187af355d3bf8d217e8778700c58a1a1078cc7`.
- Squash-merge main SHA:
  `40efa5a747713961f6fba37e568876376a2d3975`.
- Exact merge tree:
  `7705243cb7409370b3a87987e0fd3f39e7c68961`.
- Canonical full-index binary base-to-merge diff SHA-256:
  `665e75d034a589a3cbc016adebffd4cb4f68a28a4b871e9bf6235cdbbdd30667`.

The runtime authority is consumed. No replacement slice is promoted by this
closeout.

## Exact implementation shape

The implementation changed exactly the three authorized paths:

1. `scripts/ci/wait-for-vercel-health.mjs`
2. `scripts/ci/wait-for-vercel-health.test.mjs`
3. deterministic-only `scripts/repo-size-budget.json`

The exact diff contains 145 insertions and 33 deletions. The production module is
53 lines and its focused test is exactly 150 lines.

The imported success path still returns the response body. CLI success suppresses
that body. Terminal failure is a fixed diagnostic with a nonzero exit. Exact event
trace proves sleep occurs only between failed attempts. Literal URL, provider,
token, password, PostgreSQL, body, cause and payload canaries prove confidential
values do not escape through any diagnostic path.

## Verification and reviewer disposition

- Test-first RED and focused GREEN: PASS.
- Final focused poller suite: 4/4 PASS.
- CI contract suite: 370/370 PASS.
- Type, lint, root build, formatting, repository-size and security guards: PASS.
- Exact-current-head PR CI, E2E, Pilot, Sonar, CodeQL, Secret Scan, audit,
  dependency and finalizer checks: PASS.
- Feedback blockers and unresolved review threads: zero.
- GitHub Codex exact-head disposition: no major issue.
- Copilot: unavailable after normal request, explicit request and bounded wait;
  not claimed as approval.

The exact-head Sonnet route produced no output and is NON-PASS. The Gemini route
described code absent from the exact diff and is invalid/NON-PASS. The
gate-authorized exact-diff Opus fallback returned PASS with no blocker or
hardening gap. Route receipts are:

- Sonnet: SHA-256
  `9aa36646164f03f4488f45ecfca50ac98d2b5872111b3765b98852769dfe638d`.
- Gemini: SHA-256
  `93dc1feca5384221d6677c333e14895b30a7ed7b724db017007955196757700a`.
- Opus fallback: SHA-256
  `6d419bc804125fca6b2b4c7b8828f8e8bd41f089c16748986e97a08979d382ba`.

Local `pr:verify` passed its code and web-test proof, including 3,032 tests and
85.60% coverage, then reached the intentionally retired Mac mini local-Docker
boundary. It was not retried against that retired host. Current-head GitHub CI
provided the complete remote gate proof. Z620 remained untouched and local-only.

## CD incident containment

Automatic CD run `30034794556` was identified and cancellation was submitted
for the exact merge SHA. Cancellation lost the pre-checkout race: GitHub setup
and checkout completed, then Docker Buildx setup failed.

Registry login, metadata, image build and attestation were skipped. Every
staging, rollback, production and deploy job has `steps: []`. No registry login,
image build, provider call, alias/environment mutation, deployment or production
mutation was observed.

The gate therefore stopped on incident authority. Arben explicitly accepted the
event as contained before registry/image/provider/deploy and authorized only
read-only main health, cleanup, consumed-runtime closeout and child archival.
The accepted incident receipt is 2,551 UTF-8 bytes at SHA-256
`7c21ca4ebfc633d6f0e13038f9cd66e786fd183026a57abfb39e8d3dacb44db0`.
That disposition authorizes no workflow rerun, provider contact, deployment or
successor implementation.

## Exact-main health

Exact main `40efa5a7…` has tree `7705243c…`. Main CI `30034794978`,
CodeQL `30034793811` / `30034793711` and Secret Scan `30034794599`
passed. Exact-main audit reports high `0` and critical `0`.

Sonar Main `30034795028` improved the rolling-window Security Rating from D to C
but remains NON-PASS for the historical workflow signal at
`.github/workflows/pr-deterministic-backstops.yml`. That file's base and merge
blob are both `5dda794c823fa5997a2cad774389d3c7e9e94f66`; PR-head Sonar passed,
so the remaining main signal is evidence-classified as pre-existing and outside
this three-path slice.

## Advisory lifecycle and next action

AI OS observation
`91bb64cfcfd2381b09552c107b726a38d85f6a48e30b7b231ef4cc59d16c2d8c`
reports authority current, no active inferred slice and runtime
`not_authorized`. Brain failed closed once on stale advisory context; no retry,
usefulness or ROI claim is made. Repository authority governs.

This closeout consumes `IDA-SEC02`, clears its active execution and archives its
sole child/worktree. Expected resolver state is
`blocked_requires_current_authority`, `activeSlice=null`.

Frozen `IDA-UI03a2`, Z620 runner/CD use, UI/product, runtime AI, Eval v2 and every
other successor remain blocked or unpromoted. A fresh current-authority/design
gate is required before exactly one later slice and its fresh worktree child may
begin.
