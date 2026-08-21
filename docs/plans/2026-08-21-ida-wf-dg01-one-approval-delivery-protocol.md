# IDA-WF-DG01-ONE-APPROVAL-DELIVERY-R1

Status: approval candidate

Date: 2026-08-21

Tier: 3 — shared workflow, MCP identity, repository CI, and authority lifecycle

Protected base: `main@7fb7180aafadf91b79ec37f5daeebaa85bc86ff2`

Protected base tree: `d991d80615f81900306944f7bc0ab55d1153c9d8`

Canonical origin: `https://github.com/interdomestik/interdomestik.git`

Canonical gate path:
`docs/plans/2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md`

Canonical envelope path:
`docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json`

Derived approval-receipt path:
`docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json`

Stable closeout path:
`docs/plans/2026-08-21-ida-wf01-one-approval-delivery-closeout.md`

Durable authority root:
`/Users/arbenlila/.codex/state/interdomestik/ida-wf01-one-approval-delivery`

## One outcome

Enable a normal, well-scoped Interdomestik slice to receive one final exact human approval and
then proceed through isolated implementation, proof, PR, exact merge, and closeout without a
second approval unless a genuine new product, security, trust-boundary, or scope defect appears.

Git, MCP, CI, and reviewers are deterministic proof layers for implemented work. They neither
replace implementation nor manufacture authority.

## Non-goals

- No product, auth, routing, tenancy, schema, RLS, billing, provider-deployment, or E2E semantic
  change.
- No modification of an existing slice worktree, branch, PR, gate, admission, receipt, or proof.
- No automatic or time-based activation, repository variable, hidden switch, AI OS expansion,
  Docker dependency, or background writer.
- No removal or weakening of a required check, product test, security surface, or reviewer intake.
- No model, Z620, or cache result as merge authority.
- No requested GitHub Copilot review. Unsolicited feedback from any source is still intake evidence.

## Frozen factual baseline

Read-only Git, GitHub, skill, MCP, and repository inspection established:

- protected `main` equals the bound SHA/tree above; the repository is squash-only;
- protection is strict and requires `audit`, `e2e`, `pnpm-audit`, `gitleaks`, `pilot-gate`,
  `validation-surface`, `pr-finalizer`, and `commitlint`, all from GitHub Actions app `15368`;
- admin enforcement and conversation resolution are enabled; force pushes and deletion are off;
- the registered MCP control worktree is clean and detached at
  `faae32d2af477c44d2f2fed6ad36151d08b8ea8d`, with canonical origin/common Git directory;
- `/Users/arbenlila/.codex/skills/interdomestik-slice-runner` is a regular installed directory
  without a Git toplevel, common directory, or remote;
- macOS `renameatx_np(..., RENAME_SWAP)` atomically exchanged two same-filesystem test directories
  and then exchanged them back, with inode and content identity preserved.

Any pre-materialization mismatch invalidates this candidate and requires refreeze before approval.

## Approval trust and bootstrap

The one approval must name the exact UTF-8 bytes and SHA-256 of this gate and the JSON envelope,
plus the exact protected base. The directly observed human event is the authority. The derived
receipt proves only deterministic parsing, identity binding, and non-expansion; its hash does not
cryptographically authenticate the human.

After approval, Child B0 may derive the receipt with the admitted bootstrap script. The receipt
repeats the exact approval statement, event locator supplied by the orchestrator, gate/envelope
identities, base, outcome, child order, and writer-map digests. It cannot add or alter a path,
primitive, proof surface, environment, transition, or stop condition. No runtime receipt or second
approval follows.

Before B0 is healthy, only the observed approval plus these frozen bytes authorizes B0. After B0,
the canonical validator and durable ledger govern every lease. This explicit bootstrap avoids
pretending that a not-yet-installed validator validated itself.

Durable post-B0 governance writers, separately preauthorized by this envelope, are exactly:

- `authority-v1.json`, updated by expected revision, file/parent fsync, and atomic rename;
- `authority-v1.json.lock`, transient and exclusive;
- `authority-v1.json.recovery`, created only for a classified dead-owner recovery;
- `authority-v1.json.tmp-<operation-sha256>`, never reused and removed after durable rename;
- content-addressed `receipts/<operation-sha256>.json` and
  `evidence/<child-id>-<evidence-sha256>.json` below the durable authority root.

These paths record authority and evidence; they never broaden the envelope. Unknown revision,
owner, state, hash, missing path, stale lock, or failed recovery returns
`runtime_authorized:false`, `activeSlice:null`, and blocks all writers.

## Atomic topology and ownership

The surfaces cannot be one atomic writer because they span a protected Git repository, a local
installed package, a registered MCP runtime/config, and GitHub protection. One approval therefore
preauthorizes this fixed sequential topology:

`B0 authority bootstrap -> B1 CD guard -> S1A skill authority -> S1B model policy -> S2 MCP identity -> S3 exact authority -> S4A terminal delivery -> S4B reviewer policy -> closeout`

Exactly one semantic lease is active at a time. Repository children use one fresh worktree and one
fresh branch. Each S1 child uses one same-filesystem atomic package swap. Reviewers/subagents are read-only.

### B0 — approval and durable-authority bootstrap

Exact repository writers:

1. `docs/plans/2026-08-21-ida-wf-dg01-one-approval-delivery-protocol.md`
2. `docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json`
3. `docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json`
4. `docs/plans/current-program.md`
5. `docs/plans/current-tracker.md`
6. `scripts/approval-envelope-bootstrap.mjs` (new)
7. `scripts/approval-envelope-bootstrap.test.mjs` (new)
8. `scripts/repo-size-budget.json`, only if unchanged deterministic sync requires it

Required behavior:

- Materialize the exact gate/envelope and a deterministic premerge approval receipt that contains
  no clock/free-text field and never claims to bind its own future commit or merge SHA.
- Project this workflow as the only active writer program while preserving every unrelated
  historical artifact; existing slice artifacts, worktrees, branches, and PRs remain untouched.
- Implement a dedicated fsync-backed authority schema with `prepared`, `installing`,
  `installed_consumed`, `merged_consumed`, `failed_consumed`, `rolled_back_consumed`, and
  `incident`; the existing PR-oriented evidence ledger is not silently reused as authority.
- After exact B0 main health, run one separately preauthorized local initializer from the returned
  main. It writes the external completion receipt and durable state with exact `M` and then activates
  only B1. A repository merge cannot itself claim to have written local state.

B0 merge consumes its direct bootstrap authority. The canonical repository receipt binds only the
human-approved artifacts/base; the external completion receipt binds B0 `M`. Repository projections
name the workflow program, not a child lease, and never claim that the legacy resolver validated the
new envelope.

### B1 — race-free non-deploy CD predecessor

Exact repository writers:

1. `.github/workflows/cd.yml`
2. `scripts/ci/cd-nondeploy-scope.json` (new)
3. `scripts/ci/cd-nondeploy-guard.mjs` (new)
4. `scripts/ci/cd-nondeploy-guard.test.mjs` (new)
5. `scripts/ci/workflow-contracts.test.mjs`
6. `scripts/ci/cd-runner-contract.test.mjs`
7. `scripts/ci/cd-deploy-env-scope.test.mjs`
8. `scripts/ci/z620-parity.json`
9. `scripts/ci/z620-gates.json`

Before B0 and B1 merge, require zero nonterminal CD runs across all refs/events and no capable
self-hosted provider runner. Pre-arm the exact push/main watcher. B0 must be cancelled before any
runner/step. B1's new hosted scope step may run, but every provider-capable job must remain without a
runner or step; any assignment/effect is an incident. These are explicit bootstrap costs, not a
race-free watcher claim.

B1 adds one GitHub-hosted `scope` predecessor. Every staging/production self-hosted, environment,
registry, build, deploy, E2E, rollback, and evidence job has a direct `needs: scope` edge; rollback
also requires scope success and `deploy:true`. The classifier uses the complete event
`before...after` range and reads the content-addressed allowlist from parent `B`, never from `M`.
Known program paths yield `deploy:false`; product/unclassified paths, tags, and dispatch yield
`deploy:true`; lookup/range/manifest failure yields a red scope with no deploy output.

Changes to CD workflow/guard/manifest can never self-whitelist. B1 is bootstrap-contained as above;
later changes to those paths fail red before a capable job. Exact success accepts only the matching
SHA/attempt scope receipt; concurrency replacement or a prior/new competing run fails. Existing
product/tag/manual/provider behavior is unchanged when `deploy:true`.

### S1A — shared skill envelope and resolver

Owner: `/Users/arbenlila/.codex/skills/interdomestik-slice-runner`

Exact semantic writers:

1. `scripts/atomic-skill-activate.c` (new)
2. `scripts/authority-envelope-core.mjs` (new)
3. `scripts/approval-candidate-check.mjs`
4. `scripts/approval-candidate-check.test.mjs`
5. `scripts/next-slice.mjs`
6. `scripts/next-slice.test.mjs`
7. `scripts/workflow-scorecard.mjs`
8. `scripts/workflow-scorecard.test.mjs`

Required behavior:

- Validate envelope -> receipt -> canonical origin/base -> Git branch/worktree/common-dir -> MCP
  server source/target -> one unconsumed writer-map lease.
- Legacy prose and artifact-only certificates remain readable evidence but cannot grant v1
  envelope runtime authority. Lookup uncertainty, merge, or terminal failure resolves closed.
- Resolve `candidate -> approved -> active -> consumed -> closed|failed` from the durable ledger
  plus live Git/GitHub state. A merged PR overrides a stale active ledger after a crash.
- Keep Z620, model, and cache evidence optional unless the admitted tier/contract requires it.

### S1B — normative workflow routing standard v1

Writers (8): `SKILL.md`, `references/reviewer-routing.md`,
`references/workflow-routing-policy-v1.json`, `scripts/workflow-routing-policy.mjs`,
`scripts/reviewer-matrix.mjs`, `scripts/reviewer-health.mjs`,
`scripts/workflow-routing-policy.test.mjs`, and `scripts/behavior-eval.mjs`.

This config is the sole SOP source. S1B alone may bootstrap from the S1A lease/envelope: stage and
validate it against enabled repo roles, swap once, and prove non-reuse. S2+ leases bind its digest;
missing, invalid, or disallowed policy fails before writes.

| Trigger                                                  | Required route/roles                                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mechanical work                                          | Terra/Luna/Flash read-only; never decision owner                                                                                                          |
| Tier 1                                                   | owner; QA only for justified acceptance/test risk                                                                                                         |
| Tier 2 UI/workflow                                       | owner; Pixel writer for UI; QA + read-only product/accessibility review as touched                                                                        |
| Tier 3/sensitive                                         | Sol High owner; relevant writer; Security Reviewer or Sentinel for auth/tenant/RLS/security; Contracts for API/schema/config/CI; Gatekeeper verifies only |
| New primitive/architecture uncertainty/evidence conflict | Sol Ultra or one approved Opus route                                                                                                                      |
| Route failure                                            | unavailable, zero retry, Sol fallback, unchanged proof bar                                                                                                |
| Gemini/Claude                                            | explicit current slice approval or `skipped_not_authorized`; no future payload grant                                                                      |

Root/owner is sole integrator and final decision owner; reviewers may parallelize read-only. Forge and
Pixel may write together only with disjoint ownership and independent contracts. Using Sentinel plus
Security Reviewer needs a Tier-3 reason. Gatekeeper never changes product; CI/workflow edits need a
separate slice/owner. Preserve `max_threads=5`, `max_depth=1`; no nested swarm, global state,
authority creation, or subagent approval. Record only actual model/role/elapsed/outcome/fallback/
decision-impact telemetry.

S1A and S1B each use the same crash-safe full-directory activation:

1. Before acquiring a lease, prove no active implementation writer/long-lived skill consumer, free
   space, same device, `VOL_CAP_INT_RENAME_SWAP`, and a disposable cross-parent swap canary matching
   the canonical-skill-parent to attempt-parent topology.
2. Build a complete content-addressed sibling tree from the frozen preimage plus only the authorized
   writer edits. Its manifest binds path, regular-file type, mode, bytes, symlink/hardlink policy,
   and all xattr names/values; reject extra files, sockets/devices, symlinks, and hard-link surprises.
3. Run formatter, tests, skill/behavior validation, secrets, line budgets, and review. The envelope
   authorizes producing this payload after approval; before lease acquisition its exact preimage,
   approved-payload, and postimage hashes are frozen in the durable attempt. No mutable temp,
   network fetch, or model output may supply bytes after that point.
4. Persist and fsync `prepared`, acquire the exclusive install lease, persist/fsync `installing`,
   then execute the frozen attempt's `activate/atomic-skill-activate.c` build from `bin/` with
   `manifests/{preimage,payload,postimage}.json`, all outside the canonical directory.
5. The helper opens pinned parent descriptors and calls `renameatx_np` with `RENAME_SWAP`,
   `RENAME_NOFOLLOW_ANY`, and `RENAME_RESOLVE_BENEATH`; verify device/inode and non-ancestry again,
   then fsync both parent descriptors after the swap.
6. Verify both hash arrangements, then fsync `installed_consumed`. End the current consumer and
   start a fresh root consumer before any next child.

Concurrent readers see either a complete old or complete new directory. Each S1 lease consumes only
after postimage proof; neither is a PR-merge transition. Rollback swaps back
only when canonical equals the exact postimage and peer equals the exact preimage. Any other live
state is preserved as an incident, that S1 child is consumed, and successors are blocked. Recovery
classifies only the two valid pre/post arrangements and finalizes the write-ahead state; it never
blindly swaps. One exact failure rollback is allowed, never a third mutation. Attempt directories
are mode `0700`, state/receipts `0600`, and the preimage peer is retained through closeout.

### S2 — MCP control-source and per-call target identity

Owners: protected origin; runtime = `/Users/arbenlila/.codex/mcp-runtimes/interdomestik-qa`;
registration = `/Users/arbenlila/.codex/config.toml`.

Exact semantic writers:

1. `packages/qa/src/utils/tool-repo-root.ts`
2. `packages/qa/src/tool-router.ts`
3. `scripts/qa-mcp-control-runtime.mjs` (new)
4. `scripts/start-repo-qa.sh`
5. `scripts/configure-codex-local-mcp.mjs`
6. `scripts/codex-mcp-preflight.mjs`
7. `scripts/mcp-tool.mjs`
8. `scripts/setup-mcp.sh`
9. `scripts/ci/codex-contracts.test.mjs`
10. `scripts/ci/qa-mcp-worktree-contracts.test.mjs`
11. `scripts/ci/qa-cli-callers-contracts.test.mjs`
12. `scripts/ci/qa-mcp-control-runtime.test.mjs` (new)

One resolver supplies the clean/detached server source to registration, setup, preflight, launcher,
CLI, and router. Project `.codex/config.toml` stays byte-identical; the launcher/user registration
stop product-checkout source binding, and `codex-contracts.test.mjs` rejects stale `cwd = rootDir`.
Every repo-bound success and structured error carries
`serverSourceRoot`, `serverSourceHead`, `targetRepoRoot`, `targetHead`, `targetBranch`, and
`repoRootSource`; unavailable target fields are explicit nulls, never an empty identity object.
Absolute registered targets, common-dir membership, symlink containment, sequential A->B->A,
concurrent A/B, CLI parity, and negative-root/error fixtures are mandatory. Ordinary startup never
fetches, advances, registers, writes config, or restarts the host.

After exact merge/main health, one token may CAS-advance runtime/registration, restart/reconnect the
registered stdio connector, and start a fresh root consumer. Live postimage `tools/list` and A->B->A
must pass before S3. A preimage/restart/proof mismatch consumes the token and incident-closes;
rollback writes only from this operation's exact postimages.

### S3 — exact delivery and immediate authority consumption

Exact semantic writers:

1. `docs/plans/current-authority-v1.json` (new)
2. `scripts/current-authority-state.mjs` (new)
3. `scripts/current-authority-state-lib.mjs` (new)
4. `scripts/current-authority-state.test.mjs` (new)
5. `scripts/current-authority-format-audit.mjs`
6. `scripts/current-authority-format-audit.test.mjs`
7. `scripts/ci/exact-delivery-lib.mjs` (new)
8. `scripts/ci/exact-delivery.mjs` (new)
9. `scripts/ci/exact-delivery.test.mjs` (new)
10. `docs/plans/current-program.md`
11. `docs/plans/current-tracker.md`

`current-authority-v1.json` is the repository projection; the durable ledger plus live Git/GitHub
is the runtime source. Program/tracker are compact human projections and cannot grant authority.
Focused commands use `node <script>`; `package.json` stays byte-identical and cannot be mislabeled.
Every child binds base `B`, source head `H`, tested merge ref `T`, per-context tested identity,
run/attempt/app, worktree/common-dir, MCP tuple, and writer-map digest.

Every lane declares the SHA/tree it actually checks. A lane that checks `H` is acceptable only when
`tree(H)=tree(T)`; otherwise it must run on `T` or the gate fails. Static workflow-contract tests
bind each declaration to the real checkout expression, so a generic green check cannot imply merge
tree coverage.

Immediately before merge, refetch and prove unchanged `B/H/T`, `parents(T)=[B,H]`, expected merge
method, terminal delivery proof, and clean final intake. Merge with `expectedHeadOid:H`, record
returned main `M`, then prove protected main equals `M`, `parent(M)=B`, and `tree(M)=tree(T)`.
No invariant requires `tree(M)=tree(H)`.

Merge or any terminal failure immediately consumes the semantic lease. Even if the process crashes
before a ledger write, live merged/closed PR state forces `runtime_authorized:false` and
`activeSlice:null` on the next resolve. Repository closeout may lag. Only an exact bounded
postmerge operation token may finish declared health/runtime/provider work before the next lease.

### S4A — terminal delivery gate, final intake, and manifest consumers

Exact semantic writers:

1. `.github/workflows/pr-delivery-gate.yml` (new)
2. `scripts/ci/pr-delivery-contract.json` (new)
3. `scripts/ci/pr-delivery-gate.mjs` (new)
4. `scripts/ci/pr-delivery-gate.test.mjs` (new)
5. `scripts/ci/pr-delivery-workflow.test.mjs` (new)
6. `scripts/pr-finalizer.sh`
7. `scripts/pr-finalizer-lib.sh`
8. `scripts/pr-finalizer-feedback-lib.sh` (new)
9. `scripts/github-pr-governance-report.mjs`
10. `scripts/pr-review-ready.sh`
11. `scripts/ci/github-pr-finalizer-contracts.test.mjs`
12. `scripts/ci/github-governance-contracts.test.mjs`

One manifest declares three distinct acyclic sets: finalizer leaf prerequisites (excluding finalizer
and delivery gate), delivery prerequisites (including finalizer/generators but excluding delivery
gate), and provider-required contexts. It also binds conditional CI/security contexts, exact check
name + app ID + run attempt + tested SHA/tree, generator classifications, validation-surface skips,
and final conclusions. All mandatory consumers above read it; no hard-coded legacy list remains.

The API-only `delivery-gate` does not install, build, seed, start a database, run browser specs, or
duplicate product tests. It excludes itself from aggregation. `pr-finalizer` never waits for
`delivery-gate`; the gate requires finalizer plus all other declared inputs, so the DAG is acyclic.
Missing, pending, failed, cancelled, stale-head, unexpected skipped/neutral, duplicate-name,
wrong-app, old-attempt, pagination, unknown-generator, and manifest/provider mismatch fail closed.

Finalizer defers asynchronous generator adjudication to the delivery gate rather than failing early.
After declared generators are terminal or explicitly unavailable/optional, hold bounded quiescence,
paginate every check/annotation/review/comment/thread page, refetch unchanged full `H`, and fetch
unresolved threads again. Every consumer receives one immutable expected `B/H/T` certificate and
rejects an intervening synchronize, spoofed duplicate, short-SHA match, or mixed-head snapshot.
Finalizer success is an input, not terminal authority. GitHub Copilot is never requested or awaited;
any unsolicited Copilot comment is processed with all other feedback.

Protection stays unchanged during S4A; its S4B activation token is not yet active.

### S4B — reviewer request policy and protection activation

Exact repository writers:

1. `.github/reviewer-routing.json`
2. `.github/pull_request_template.md`
3. `docs/BRANCH_PROTECTION_MULTI_AGENT.md`
4. `scripts/github-request-pr-reviewers.mjs`
5. `scripts/github-request-pr-reviewers.test.mjs`
6. `scripts/ci/github-reviewer-request-contracts.test.mjs`

Remove every automatic/manual instruction that requests or waits for GitHub Copilot while retaining
Codex and other manifest-declared routes. Unsolicited feedback remains in S4A final intake. Use the
S4B PR as the same-head live canary for the already merged S4A gate.

After the canary, the prederived token adds only
`{context:"delivery-gate", app_id:15368}` to protection. Write only when live protection equals the
captured preimage. Read back the full preimage `checks` set plus that one exact tuple while preserving
all existing/additive contexts and protection flags. Rollback only when live equals this operation's
exact postimage; otherwise preserve observed state and incident-close. No subordinate context is
removed.

## Drift and rebinding

- Before B0, any protected-main drift invalidates the approval identities.
- At every later child boundary, bind normally to the exact returned main of the predecessor.
- A machine-derived rebind may be repeated at a later boundary without human approval only when
  origin is unchanged, ancestry is linear, every intervening path is disjoint from remaining
  writers/consumers/contract nodes, and all affected certificates replay green.
- After a child worktree has changes, compatible drift requires a fresh worktree and exact patch
  replay; there is no silent rebase.
- Overlap, non-linear history, unavailable lookup, security/protection weakening, or toolchain,
  package-manager, lock, workflow, MCP, auth, routing, schema, RLS, billing, or provider effect stops
  for new authority. Additive protection drift may be preserved only through compare-and-swap.

## Lean tier gates

| Tier | Mandatory proof before PR/merge                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 0    | formatter, diff, secret, line/size, exact writer map                                                                       |
| 1    | Tier 0 + focused tests and owning lint/type contract                                                                       |
| 2    | Tier 1 + dependency/consumer closure and repository-required verification                                                  |
| 3    | Tier 2 + admission/candidate certificate, security/CI contracts, terminal aggregator, and any changed trust-boundary proof |

Existing repository-required gates remain authoritative until separately changed. E2E runs only
when the repository contract or changed surface requires it; this protocol neither removes nor
duplicates it. Z620 is required only for an admitted environment-specific proof. Cache telemetry is
layer-specific evidence only. Model review is targeted by risk and never replaces deterministic
proof.

## Line, size, and readability budgets

- Every new/refactored production file is `<=150 physical lines`.
- A focused test/evaluation file may use `<=200 physical lines` only for one readable matrix, with
  the reason in its PR; no production waiver exists.
- New/refactored helpers for resolver, MCP, CD, and final intake must be `<=150 physical lines`.
  Touched grandfathered files already above 150 may not grow and must leave the touched logical path
  smaller/extracted; `behavior-eval.mjs` must shrink to `<=200`.
- The 340-line finalizer must decompose to `<=150`; its focused libraries remain `<=150`. The
  declarative 337-line `cd.yml` may not grow and must move new logic to the admitted helper without
  minification.
- `SKILL.md` may not exceed its 299-line baseline; reviewer routing may not exceed 110 lines.
- This gate is `<=500` lines, the envelope `<=650`, current program `<=150`, current tracker `<=60`,
  and each new authority/receipt JSON `<=150`.
- Touched oversized legacy code cannot grow; its active logical path must shrink or be extracted
  within the admitted writer map.
- No minification, compressed fixtures, generated one-line code, or readability waiver.
- `scripts/repo-size-budget.json` changes only through deterministic sync of the exact tree.

## Three proof surfaces

### P1 — envelope, atomic skill, ledger, exact merge, and closeout

Prove receipt non-expansion, wrong identity/prose-only failure, lock/recovery, complete bundle swap
and guarded rollback, one writer, live-merge crash consumption, `parents(T)=[B,H]`,
`parent(M)=B`, `tree(M)=tree(T)`, compatible/unsafe drift, and success/failure closeout.

### P2 — MCP source/target identity

Prove clean immutable server source, identity-bearing success/error, sequential A->B->A,
concurrent A/B, negative roots, CLI parity, runtime activation, compare-before-write, guarded
rollback, and mismatch preservation.

### P3 — CD guard and terminal PR delivery

Prove B0/B1 bootstrap containment, non-deploy/product/tag/manual/error matrices, full-range parent
manifest classification, no provider-capable job before the hosted guard,
required/conditional context matrices, acyclic finalizer/gate topology, generator terminality,
feedback arrival races, same-head second intake, add-only protection CAS, and exact-main health.

All required tests use `skipIsFailure:true`.

## Execution and consumption sequence

For every child: resolve exact unconsumed lease; prove origin/base/worktree/MCP/writer digest; run
focused RED then GREEN; run formatter/diff/line/size/secret/contracts; run one substantive Sol review
after mechanical green; run only tier-required local proof; push one head; accept only same-head
terminal CI/review evidence; perform final intake; merge with expected-head guard; consume authority;
prove exact main/CD disposition; clean exact branch/worktree; then derive the next lease.

Repository merge consumes the semantic lease before health/cleanup. Each local S1 consumes on atomic
postimage success/failure. MCP/protection transitions use separate single-use postmerge tokens and
cannot reopen semantic authority. Rerun only invalidated proof; cancel stale-head CI, never current
evidence. No optional route outage is a stop unless the tier made it mandatory.

## Success and failure closeout

Success requires all eight children completed, skill postimage/preimage hashes retained, MCP live
attestation, terminal `delivery-gate` additive protection, exact-main surface-appropriate health,
CD guard disposition, final `closed` / `runtime_authorized:false` / `activeSlice:null`, compact
projection parity, exact branch/worktree cleanup, unrelated-state preservation, branch hygiene,
clean synchronized main, and no unauthorized provider effect.

Closeout governance writers are only the stable closeout document, `current-authority-v1.json`,
current program, current tracker, and conditional deterministic repo-size metadata. Both success and
failure closeout are preauthorized; neither needs another strategic approval.

Every terminal failure consumes the active lease/token, clears runtime authority and active slice,
blocks successors, and preserves evidence. Pre-merge failure reverts only unmerged scoped state.
Post-merge failure never rewrites protected main. Atomic-skill, MCP-config, and protection rollback
occur only after exact postimage comparison; concurrent or unknown state is preserved and reported.

## Stop conditions

Stop only for a concrete failure: artifact/receipt/origin/base/head/tree/common-dir/MCP/writer/lease
mismatch; unlisted path or second writer; non-linear/overlapping drift; required proof or final
feedback failure; formatter/secret/line/size/contract failure; unsafe rollback/cleanup; or a genuine
new product, security, privacy, trust-boundary, provider, or scope defect. Optional model, Z620, or
cache evidence being unavailable is not a stop.

## Admission decision

Request one human approval only after the unchanged admission checker, Tier-3
`approval-candidate-check`, formatter WRITE then CHECK, JSON/binding/writer/line/secret/base checks,
primitive canaries, and one clean adversarial review all pass on these final bytes. Until that hold
is approved, no repository, shared-skill, MCP, provider, runtime, current-authority, branch, PR, or
existing worktree surface may change.
