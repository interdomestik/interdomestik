# IDA-CD01 closeout — staging alias preimage and rollback guard

## Outcome

`IDA-CD01` is complete. The staging CD lane now snapshots the authenticated
canonical-alias preimage, verifies the exact same-project/team deployment and
commit, records confirmed alias movement, and restores the exact preimage after
any later non-cancellation deploy-verification or staging-E2E failure.

Cancellation remains an incident-authority stop and never performs provider
rollback. Ordinary pushes still skip production. No deployment, provider call,
alias mutation, database contact or production action was performed while
implementing, reviewing, merging or closing this slice.

## Authority and merge

- Canonical design gate `IDA-CD-DG01` R1: 12,974 UTF-8 bytes, SHA-256
  `87e3683f1150cc5eb7a2fca4638cc6bb865d9cf850017594b1ca96bd5ad83357`.
- Exact runtime-authority receipt: 8,257 UTF-8 bytes, SHA-256
  `544156dda6b15836061219e3a2a880ad135a4bc7680df8221a049b622a2dde5a`.
- Local-E2E bootstrap disposition: 6,680 UTF-8 bytes, SHA-256
  `513aa5658702a5bac97fa0c2d140260640ce398099fca86455d5174d5c560087`.
- Exact implementation base:
  `483dc33015515400d7e784976893407ce78c6f41`.
- Implementation PR: [#1415](https://github.com/interdomestik/interdomestik/pull/1415).
- Final implementation head:
  `8ded18d9f9869f027f7831f4deae5ac6ab9a6a52`.
- Squash-merge main SHA:
  `280ea41908639e3e9807191a711553276d5c650d`.
- Exact merge tree:
  `40fde0b7769baf3d3806f12e77bf7d1419060e26`.
- Canonical full-index binary base-to-head diff digest: SHA-256
  `0256e002a450efb1c4c43c86bce502eafb2188ec1450229e3348c46bd1f4a99c`.
  The exact command is
  `git -c color.ui=false diff --no-ext-diff --no-textconv --full-index --binary --src-prefix=a/ --dst-prefix=b/ 483dc33015515400d7e784976893407ce78c6f41 280ea41908639e3e9807191a711553276d5c650d | shasum -a 256`.

The runtime authority is consumed. No replacement slice is promoted by this
closeout.

## Exact implementation shape

The implementation contains exactly the seven authorized paths:

1. `.github/workflows/cd.yml`
2. `.github/actions/trigger-digest-verified-deploy/action.yml`
3. `scripts/ci/configure-vercel-gate-url.mjs`
4. `scripts/ci/vercel-staging-alias-state.mjs`
5. `scripts/ci/vercel-staging-alias-state.test.mjs`
6. `scripts/ci/cd-deploy-env-scope.test.mjs`
7. deterministic-only `scripts/repo-size-budget.json`

The exact base-to-head shape is 622 insertions and 224 deletions. The two new
focused modules are 150 lines each and the workflow contract test is 149 lines.
The frozen `scripts/ci/cd-attestation-contract.test.mjs` did not change.

The implementation resolves the canonical alias through the authenticated alias
API, follows the returned deployment ID through the authenticated deployment API,
and requires the expected project and team. It captures the direct deployment
hostname and exact health commit before movement. The receipt starts with
`aliasMoved:false` and is atomically replaced with `aliasMoved:true` only after
confirmed assignment.

The same-run receipt artifact is uploaded before downstream checks. A
credential-free rollback guard rejects missing, malformed, ownership-mismatched or
unconfirmed receipts before the restore step receives provider credentials.
Restore checks the direct preimage host against the exact prior commit before
alias assignment and then verifies canonical health against that commit. Restore
or receipt-upload failure remains red.

## Verification and reviewer disposition

- Pre-implementation RED and focused GREEN evidence: PASS.
- Frozen-inclusive helper/workflow/attestation suite: 28/28 PASS.
- Prettier, deterministic repository-size sync/check and `git diff --check`: PASS.
- `pnpm security:guard`: PASS.
- PR-head audit: high `0`, critical `0`.
- Exact current-head PR CI, full E2E, Pilot Gate, SonarCloud, CodeQL, Secret Scan,
  pnpm audit, Semgrep, OSV, dependency review, deterministic backstops and
  `pr-finalizer`: PASS.
- Feedback intake: zero blockers; review threads: zero unresolved.

GitHub Codex found and drove fixes for the chained-comparison, direct-preimage
health and official alias `deploymentId` issues on earlier heads. Its final
test-only-head request was acknowledged but produced no review during the bounded
wait and is classified unavailable, not as approval. Copilot reviewed exact head
`8ded18d9…` and reported no actionable defects.

Sonnet 4.6 final implementation routes produced no output and are blocked,
not approvals. Gemini's final-delta route was blocked by plan-mode/tool mismatch
and capacity limits. Opus 4.8 reviewed the exact final test-only delta and returned
PASS with no residual blocker or hardening gap; its inability to execute shell
commands is covered by the exact 28/28 local proof and green current-head CI.

The accepted test hardening binds upload/download artifact names, upload receipt
path, downloaded receipt reconstruction and rollback receipt path. The remaining
ambiguous-provider-assignment outcome requires a future design-gate semantic
amendment if pursued: the current gate intentionally records confirmed movement
only after assignment succeeds, so a pre-mutation `pending` or `true` state is not
silently introduced here.

## Deployment containment and exact-main health

Automatic CD run `30019447228` was cancelled immediately after merge. Every job
completed cancelled with `steps: []`, including build/deploy/E2E staging,
rollback, production evidence, production build/deploy and production
verification. Checkout, registry login, image build, provider mutation and
deployment never started.

Post-merge `main@280ea419` CI `30019443596`, CodeQL `30019439797` /
`30019440069` and Secret Scan `30019447158` passed. Local exact-main audit reports
high `0` and critical `0`.

Sonar Main Gate `30019443913` is NON-PASS for two external rolling-window
vulnerabilities outside this slice. Historical issue
`AZ-ACoVO5G2i53uX0BTV` remains at untouched
`.github/workflows/pr-deterministic-backstops.yml:88`, whose base and merge blob
are both `5dda794c823fa5997a2cad774389d3c7e9e94f66`. Newly surfaced issue
`AZ-PjPUTEQjECzTb2IEc` / `jssecurity:S8689` points to
`scripts/ci/wait-for-vercel-health.mjs:29`; that file is outside the seven-path
map and its base and merge blob are both
`c6d8e7d144de3adc1c47417a3406cb1e5682a19b`. It is a genuine new security signal
requiring separate current authority, not an attributable IDA-CD01 regression or
an authorized eighth path.

The gate's optional post-merge live staging execution was not performed because
the exact runtime authority and root mandate kept provider, alias and deployment
authority false and required immediate CD containment. Runtime rollback behavior
therefore remains repository/CI-proven, not live-provider-proven.

## AI OS, Brain and closeout honesty

AI OS observation
`10f5cfe85345d0b1f1a1eb3eac17fce84b861db64dce3ed16d376dee4405a92b`
observed clean exact main `280ea419…`, authority current and runtime
`not_authorized`. Before this canonical closeout it optimistically reported
`activeSlice=null`, while the worktree-scoped repository resolver correctly still
selected `IDA-CD01`; repository authority governed and this closeout resolves the
drift.

The one closeout Brain query failed closed because its source snapshot was stale
after the two new helper/test files and two modified CI sources. No reindex or
retry was performed, and no usefulness, ROI, cost or quality-improvement claim is
made.

## Closeout and next action

The canonical program and tracker consume the sole `IDA-CD01` promotion. Runtime,
provider, deployment and production authority are closed. Frozen
`IDA-UI03a2`, Z620 runner/CD use, UI/product work, runtime AI, Eval v2 and every
other successor remain blocked or unpromoted here.

Expected resolver state after this closeout is
`blocked_requires_current_authority`, `activeSlice=null`. The next step is a fresh
current-authority/design gate for exactly one successor; the newly surfaced Sonar
security signal must be dispositioned there before any implementation child is
created.
