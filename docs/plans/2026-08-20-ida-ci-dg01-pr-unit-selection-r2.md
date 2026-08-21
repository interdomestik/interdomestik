# IDA-CI-DG01 — PR Unit Selection R2

## Status and authority

- Classification: corrective parent Tier-3 design-gate rebind candidate; pre-authority only.
- Repository authority base: protected `main@ca91e67e0535c96a94e55d6dde12716823172e26`.
- R2 repairs the discovered Z620 writer-map admission defect only: it replaces the unused
  compatibility-reserved `scripts/ci/coverage-gate.mjs` writer with the required deterministic
  `scripts/ci/z620-parity.json` digest writer. The outcome, proof surfaces, shared consumer,
  special environment, fail-closed behavior, and no-skip A1 semantics are unchanged.
- Promotion effect: none until the exact formatted bytes and SHA-256 are approved and
  materialized through repository authority.
- Current canonical state remains `runtime_authorized:false`, `activeSlice:null`, with all
  successors blocked.
- This candidate authorizes no branch, writer, workflow dispatch, repository variable, hidden
  switch, provider mutation, automatic activation, or time-based activation.

Canonical future repository paths are frozen as:

- parent gate: `docs/plans/2026-08-20-ida-ci-dg01-pr-unit-selection-r2.md`;
- A1 admission: `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-admission-v2.json`;
- A1 runtime receipt:
  `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-runtime-receipt-r2.json`;
- A1 sanitized closeout evidence:
  `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-closeout.md`.

The earlier candidate or formatting-invalid approval identities
`109971938b0ccb181970816f00fd1e45bcfc08441c89c0773880be04859abc4f`,
`491acd6c4963e6a70f6722f7cf3a6847dc5b7184cb7b55e00397cf2e5fc930b4`,
`bff22665b63a95b067ae8d42a92dd2612f2e544d89e020c318fa46f8cdf16348`, and
`bab55e8ab8f05c66aa2665d7f4b726c5f2d64daa83807cb7b7d5470d2164a55a`, plus the
canonical-formatter-only identities
`409584a9f1812618fa3da66e687a2a282d8e53da5092121df8570b74354ee42f` and
`9de2078147b50904f14dfc3a1053f1cffa29b6459b62795e161a86ecdf514759`, plus the
pre-review identities
`3281927eb48fbbc5840e036510784aea76b7f3b563e4acdf52fcd721f278ce46` and
`0ec7ad7bfb146e57e5754337897a7322c0ce22a3be6c079a41f25578ea9dadb7`, plus the
merge-topology-invalid identities
`3780375e7785e950abb60157a6a7803cfa5d40a92c34c3c625d20a91f1f90848` and
`202f0fb34dc23db9b00fedb6dad45cf2984ed43766686efa27b312a22775d5cc`, plus the
closeout/CD-incomplete identities
`35f5cba3e2419836440c4a9ed137bb157dfbb8e56800123b21215f83117368da` and
`b3619280b1653a3e210d01ed8f67aadd793815d7a604065f9f19c3a729d13e88`, plus the
all-event-CD-conflict-incomplete identities
`9605838e5011c919f07399bae6931e7461eaa2e198381dd02b8226e3ee3f5013` and
`b26cac80c0123a0941892797f7be7df46602a1e2b928a499d0f9f918ea375764`, are superseded.
The materialized R1 gate `a6def1ddceb5b7e0fa0e08dbcce9045f4500e612643437f3e1a51c04843f9514`,
admission `92a68b8d2626686c905e9010220291c4afb8a480e1372cf9817ed76ac7427f02`, and
runtime receipt `488c6f9785dcc25e40e806f5fd21d640e114917f62b8fd86e68d9cf64c8a47f5`
are superseded for A1 implementation because R1 omitted the mandatory Z620 parity-digest writer.
They have no current implementation-approval effect.
All earlier identities are superseded,
have no current approval effect, and must not be newly materialized, merged, or relied upon.

## One program outcome

Safely reduce unnecessary PR unit work while preserving full failure detection, fail-closed
behavior, and the existing security, release, RLS, E2E, Pilot, finalizer, CodeQL, and Sonar
contracts.

## Exact two-child topology

```text
IDA-CI-DG01
├── A1: shadow infrastructure + coverage completeness + full-unit nightly
│   ├── full PR unit remains mandatory
│   ├── selected-vs-full receipts are evidence only
│   └── S1 + S2 + S3 evidence closes A1
└── A2: enforcement activation
    ├── separately admitted against exact merged A1 main
    ├── requires S3 PASS, zero misses, 100% unsafe fallback, measured gain
    └── activates affected-only PR units; main/nightly/release stay full
```

A1 and A2 are two distinct implementation slices and PRs. They cannot be combined. No third
implementation tranche exists in this program.

## Complete authority lifecycle

### Historical Phase A — authority PR only

Phase A is bound to protected `main@faae32d2af477c44d2f2fed6ad36151d08b8ea8d` and may write only:

1. `docs/plans/2026-08-20-ida-ci-dg01-pr-unit-selection.md`;
2. `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-admission-v1.json`;
3. `docs/plans/current-program.md`;
4. `docs/plans/current-tracker.md`;
5. conditional `scripts/repo-size-budget.json`, only when the unchanged
   `node scripts/repo-size-budget-sync.mjs` generator produces the exact required metadata diff.

Phase A contains no semantic/runtime writer and may not copy the exploratory prototype. After its
merge, exact-main health, CD containment, and cleanup must pass. Its only successful resolver
transition is `awaiting_runtime_authority` for `IDA-CI01-PR-UNIT-SHADOW-A1`, with
`runtime_authorized:false`; no branch or implementation worker may start.

Phase A, the R2 authority rebind, and the later A1 closeout have an explicit governance-only tree-equivalent main-health
contract. The protected-main CI workflow intentionally ignores `docs/**` and
`scripts/repo-size-budget.json` on `push`, and the repository contract test preserves that policy.
Therefore absence of a CI run for any governance-only squash SHA is expected only when all of
the following are proven:

1. the diff contains only the applicable exact writer map: Phase A's five authority writers; R2's
   canonical R2 gate, canonical A1 admission V2, current program, current tracker, and conditional
   size metadata; or A1 closeout's sanitized evidence, current program, current tracker, and
   conditional size metadata;
2. protected main still equals that PR's exact approved base immediately before merge;
3. the repository's squash-only settings remain enabled, and the exact-head merge mutation uses
   `mergeMethod:SQUASH` plus the reviewed head as `expectedHeadOid`;
4. the returned squash commit has exactly one parent equal to the approved base and a tree
   byte-identical to the exact reviewed PR head tree;
5. all required exact-head PR checks, CodeQL, Sonar, secret/security checks, governance audits,
   and reviews are terminal green with zero actionable or unresolved feedback;
6. the exact-head PR proves the unchanged docs-only main-push exclusion contract;
7. after merge, protected main equals the returned squash SHA and the recorded PR, reviewed-head,
   sole-parent, and tree identities still match; and
8. the matching post-merge Secret Scan, both configured dynamic CodeQL push analyses, and Sonar
   Main Gate finish successfully. A main-push CI run is expected to be absent; if one exists, it
   must also finish green.

That complete receipt is the exact-main health proof for Phase A, R2 authority rebind, and A1 closeout only. It is not a
general main-check reuse primitive and cannot be used by A1 implementation. Any changed path
outside the applicable writer map, base drift, merge-setting drift, non-squash merge, stale
`expectedHeadOid`, non-single or non-matching parent, tree mismatch, missing exact-head or
post-merge signal, unexpected main-push CI result, or failed signal is exact-main health failure.

Any protected-main/base drift before Phase A materialization invalidates every candidate byte and
hash. Stop, re-audit, rebind, reformat, re-review, and refreeze from the new protected main. Silent
rebase, merge-forward, or SHA substitution is forbidden.

### Separate A1 runtime authority

Only after the exact R2 governance-only tree-equivalent main-health receipt may the content-addressed A1
runtime receipt be drafted at
`docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-runtime-receipt-r2.json`. It must bind the exact
returned R2 rebind merge/main SHA, the canonical gate and admission hashes, the admitted writer maps, and the
preimplementation canaries. Separate byte-exact human approval of that receipt is mandatory.

Protected `main` must still equal the returned R2 rebind merge/main SHA independently at three
checkpoints: before R2 drafting, immediately before byte-exact R2 approval, and immediately before
fresh A1 child/worktree/branch creation. Any mismatch stops A1 before runtime authority or writer
creation; re-audit the intervening main changes, rebind and refreeze the affected authority bytes,
and repeat required review/approval from the new exact main. Silent rebase, stale-main branch
creation, merge-forward, or SHA substitution is forbidden.

That exact R2 approval is the only transition to `active_implementation` with
`runtime_authorized:true`. The A1 admission is readiness evidence only and grants no implementation
authority. Only after R2 approval may one fresh child worktree and one fresh branch be created from
the returned exact R2 rebind main; that child is the sole semantic writer. The detached audit
worktree and its prototype remain provenance only.

### R2 corrective authority rebind

R2 is bound to protected `main@ca91e67e0535c96a94e55d6dde12716823172e26`, the exact Phase-A
squash main. It may materialize only its canonical R2 gate, canonical A1 admission V2, compact
current-program/current-tracker projections, and conditional unchanged-generator size metadata.
It grants no implementation authority. A separate R2 runtime receipt and byte-exact human approval
remain the only transition to `active_implementation` with `runtime_authorized:true`.

Any protected-main drift before R2 materialization or before R2 runtime approval stops for a fresh
intervening-main audit, rebind, formatter/check cycle, review, and byte-exact approval. Silent
rebase, merge-forward, or SHA substitution is forbidden.

### A1 implementation PR governance writers

The A1 implementation PR keeps its governance writers separate from the 12 semantic writers. Its
only governance writers are:

1. `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-runtime-receipt-r2.json`;
2. `docs/plans/current-program.md`;
3. `docs/plans/current-tracker.md`;
4. conditional `scripts/repo-size-budget.json`, only from the unchanged size generator.

No gate/admission rewrite, strategic expansion, or A2 materialization is permitted in A1.

### A1 closeout PR governance writers

One separate closeout PR is mandatory after the A1 implementation merge. Its only writers are:

1. `docs/plans/2026-08-20-ida-ci-pr-unit-shadow-a1-closeout.md`;
2. `docs/plans/current-program.md`;
3. `docs/plans/current-tracker.md`;
4. conditional `scripts/repo-size-budget.json`, only from the unchanged size generator.

Both success and failure closeout are preauthorized by this gate. They require exact evidence and
normal PR review/checks, but no extra strategic approval. The closeout contains sanitized IDs,
hashes, dispositions, main-health/CD/cleanup evidence, and no secrets or raw logs. Success closeout
requires frozen green S1, S2, and S3; failure closeout requires a named preauthorized failure class
and preserves the incomplete or failed evidence disposition.

### A2 remains independently gated

A2 later repeats independent admission, exact-main runtime receipt, byte-exact human approval,
implementation, and closeout against the exact A1 closeout main. Its implementation and closeout
writer maps remain deferred and cannot be inferred from A1. A2 may use at most four semantic paths,
introduce no new primitive, and cannot create a third tranche.

## Child A1 — shadow only

### A1 outcome

Produce deterministic changed-file → package → consumer selection, execute it only as shadow
evidence after the unchanged full PR unit suite, close the coverage-summary completeness gap,
and add a separate full-unit nightly lane without changing E2E semantics.

### A1 semantic writer map — exactly 12 paths

1. `scripts/ci/unit-shadow-selector-lib.mjs`
2. `scripts/ci/unit-shadow-selector.mjs`
3. `scripts/ci/unit-shadow-runner.mjs`
4. `scripts/ci/unit-shadow-test-owners.json`
5. `scripts/ci/unit-shadow-selector.test.mjs`
6. `scripts/ci/unit-shadow-selector-cli.test.mjs`
7. `scripts/ci/unit-shadow-runner.test.mjs`
8. `scripts/ci/coverage-summary-contract.mjs`
9. `scripts/ci/z620-parity.json`
10. `scripts/ci/coverage-contracts.test.mjs`
11. `.github/workflows/ci.yml`
12. `.github/workflows/unit-nightly.yml`

No other semantic writer is permitted. Any additional writer, proof surface, shared consumer,
special environment, or primitive invalidates A1 admission and requires stop-and-split; because
the two-slice program budget is already exhausted, such a finding closes the program without a
third tranche.

The map is an authorization ceiling, not a requirement to manufacture a diff in every path.
`coverage-gate.mjs` remains byte-identical and behavior-compatible. `z620-parity.json` is the
required deterministic digest/coverage declaration for the admitted `ci.yml` change. The new
completeness behavior belongs to the explicit `coverage-summary-contract.mjs` CLI consumed only by
the CI unit and full-unit nightly entries.

### A1 contract

- The selector reads changed files, validates normalized repository-relative paths, resolves all
  workspace packages, builds deterministic direct and transitive consumer closure, and validates
  every manifest entry and task kind before producing a selection.
- The manifest explicitly distinguishes `test:unit`, `check`, always-required external context,
  summary-producing coverage, explicitly summaryless coverage, and full-fallback ownership.
- `domain-case` and `domain-recovery` are the only expected domain packages classified as
  summaryless because their `tsx --test` runners do not emit Vitest `coverage-summary.json`.
- A separate explicit completeness command runs after coverage generation in the CI unit and
  full-unit nightly entries. Missing or malformed summaries for web, shared-auth, or any other
  expected domain package fail those entries. Silent filtering is forbidden there.
- Existing `coverage:gate` callers outside A1, including `pr:verify`, Pilot verification, local
  parity, and release candidate verification, retain their current command and behavior. A1 does
  not place the new completeness mode behind an environment variable, repository variable, label,
  timer, or hidden switch. It is an explicit CLI command in the two admitted entries.
- A missing/invalid graph, changed-file lookup, package, owner, task, manifest, head binding,
  receipt, coverage contract, or comparator result selects the full PR unit suite.
- Lockfiles, root/package-manager/Turbo configuration, CI workflows/actions, generated sources,
  auth/shared-auth, database/schema/RLS, routing/proxy, tenancy, billing, security, release, and
  unknown paths select the full PR unit suite.
- During A1, the existing full PR coverage and release-unit steps run first and remain required.
  Shadow tasks run only to produce selected-vs-full status, duration, fallback, and missed-failure
  evidence. A shadow error cannot mask the original full-suite conclusion.
- Main push and the separate full-unit nightly lane run full coverage followed by the explicit
  completeness command. Release candidate verification remains unchanged and continues to run the
  complete unit/coverage path through `pr:verify:hosts` → `pr:verify` → `coverage:gate`.
- Receipt artifacts bind exact base SHA, head SHA, run attempt, changed files, graph/manifest
  version, selected/full tasks, statuses, durations, fallback reason, and hypothetical misses.
- A1 cannot activate skipping under any condition.

### A1 evidence sequence

- **S1 — offline contracts:** selector/owner/graph/fallback contracts and coverage completeness,
  including QA-without-`test:unit`, malformed inputs, missing owners, summaryless expectations,
  and missing expected summaries.
- **S2 — current-head CI shadow:** the full unit suite still runs; selected candidates also run;
  an exact-head receipt records pass/fail and wall-time without skipping any unit test.
- **S3 — replay comparator:** historical QA, web/product, database, CI-config, and lockfile classes
  plus only the live diff classes still uncovered. S3 passes only with zero full-suite failures
  missed, 100% fail-closed handling for unsafe classes, and measured wall-time reduction.

## Child A2 — enforcement only

### A2 admission preconditions

A2 has no current writer authority. Its independent V1 admission and exact-main binding are
drafted only after A1 success closeout is merged, that exact closeout main is healthy, all A1
receipts are durable, and S3 records `PASS` with:

- zero full-suite failures missed;
- 100% full fallback for every declared unsafe category;
- measured net PR unit wall-time reduction;
- at least 80% median projected unit-job reduction for the QA-only class;
- no unsupported savings claim for web/domain changes;
- unchanged required security, RLS, release, CI-contract, E2E, Pilot, finalizer, CodeQL, and Sonar
  contexts.

### A2 frozen topology

- One outcome: activate the already-proven selector for PR unit enforcement.
- Writer map: deferred until it is derived from exact A1 merged main and S3 evidence.
- Writer ceiling: at most four semantic paths, all within A1's established primitive topology.
- No new selector, graph, receipt, coverage, environment, provider, or fallback primitive.
- No automatic/time-based activation, repository variable, hidden switch, label switch, provider
  mutation, or implicit rollout.
- Activation requires a separate byte-exact A2 admission and explicit human approval.
- Main, nightly, and release remain full; any unsafe PR diff remains full fallback.

## Explicit non-goals

- No E2E spec, selector, coverage, workflow, seed, database, browser, or gate semantic change.
- No Pilot Gate, Pilot verification, PR finalizer, reviewer, CodeQL, Sonar, gitleaks, pnpm-audit,
  security-guard, RLS, release-gate, release-candidate, local-parity, required-context,
  branch-protection, or provider semantic change. The default `coverage:gate` path remains
  compatibility-locked for these callers.
- No product, auth, routing, proxy, tenancy, schema, migration, billing, Vercel, deployment, or OD17
  change.
- No cache policy, artifact reuse, build reuse, DB reuse, gate consolidation, or finalizer timing
  optimization.

The Phase-2 finalizer/reviewer candidate is closed as `insufficient evidence / no change`. It is
not a successor and cannot consume a third implementation tranche.

## Exploratory prototype custody

The detached worktree at protected main contains an exploratory prototype created after the
user's direct `authorized!` message. It is not repository-authorized implementation. Its six
dirty paths remain preserved exactly and unstaged:

| Path                                           | Current lines | SHA-256                                                            |
| ---------------------------------------------- | ------------: | ------------------------------------------------------------------ |
| `scripts/ci/coverage-contracts.test.mjs`       |           162 | `3e478da7f5cf0fc3b5eb607dfc02ef57b66b570e2a0bd03a3204586b97bc34cf` |
| `scripts/ci/unit-shadow-selector-cli.test.mjs` |            26 | `dffeaa25c0176df7e3f3164e72dee53fcffcf68da4698b31be92566bf355f6ae` |
| `scripts/ci/unit-shadow-selector-lib.mjs`      |            98 | `93d9cd250ed173e9fb9782b38dba7b84c1df60e04475d5bfc6f3f71924290c39` |
| `scripts/ci/unit-shadow-selector.mjs`          |            64 | `afaaf8e0715be32a39117f736993254a574461a8737cbd68084670ba218c5d80` |
| `scripts/ci/unit-shadow-selector.test.mjs`     |           105 | `bf353ed78e3d2aadbb78dc14b8afe8d5d62756f1b2835acf6971fbb8ed4737c7` |
| `scripts/ci/unit-shadow-test-owners.json`      |            27 | `cf8d14c52690f9d0233e1a434eac14473f6a3c4ec2660c9506a023b81622246a` |

Only after byte-exact R2 approval may those bytes be transferred into a fresh post-R2 A1 child
created from the approved exact main. The detached audit worktree never becomes an implementation
writer, branch source, staging surface, or commit source. Transfer is an uncommitted patch replay
for provenance, not an acceptable repository checkpoint: the 162-line exploratory coverage test
must be reduced to `<=150 physical lines` in the same working change before any commit. Refactoring remains
limited to the admitted A1 writer map.

## Primitive and line-budget feasibility

- Node's filesystem, JSON, child-process, timing, hashing, and `node:test` primitives are present.
- Current workspace manifests expose 25 packages and deterministic workspace dependency edges.
- Existing selector/CLI proof is 7/7 green; the coverage omission proof is intentionally RED at
  5/6 until A1 implements the completeness contract.
- Every new or refactored production JavaScript and test file remains at `<=150 physical lines`.
  There is no A1 test-file exception and no minification or compressed formatting.
- `coverage-gate.mjs` remains byte-identical; `z620-parity.json` is formatter-validated JSON whose
  SHA-256 digest is deterministically derived from the reviewed `ci.yml` bytes and then verified by
  the existing Z620 parity contract. A1 introduces no parity-digest generator or new primitive.
- `coverage-summary-contract.mjs` owns the explicit completeness CLI. The shared default
  `coverage:gate` command remains behavior-compatible for all non-A1 callers; any default-path
  semantic drift is a blocker.

## Merge containment, success cleanup, and terminal closeouts

### Exact-SHA CD containment for every admitted merge

Phase A authority, R2 authority rebind, A1 implementation, and A1 closeout each use the same bounded success contract:

1. Read-only preflight through the repository runners API must show no online runner matching both
   `self-hosted` and `interdomestik-z620-staging`. The workflow-runs API must show zero `cd.yml` runs
   whose status is anything other than terminal `completed`, across every event and ref; because
   every `cd.yml` invocation shares one repository-wide canonical staging concurrency group, that
   all-event/all-status workflow query is the observable conflict proof. Any match blocks merge.
2. Before merge, pre-arm one GitHub control-plane watcher bound to the exact PR number, approved
   base, reviewed head, and the squash merge mutation's returned exact SHA. It polls the runner
   inventory and all-event `cd.yml` workflow inventory once per second for at most 120 seconds. No
   nonterminal run is allowed before the mutation returns; afterward, the returned squash SHA's
   exact `push`/`main` run is the sole allowed nonterminal run. Any other nonterminal run or any
   identity or runner-readiness drift stops containment.
3. The merge mutation must use `mergeMethod:SQUASH` and `expectedHeadOid` equal to the reviewed
   head. The watcher may cancel only the `cd.yml` `push`/`main` run whose `head_sha` equals the
   returned squash SHA; it may not dispatch, approve, rerun, or mutate any other run or provider.
4. Cancellation must occur before runner assignment, before any step starts, and before any
   provider action. Success requires terminal `cancelled`; every job must expose `steps:[]` and a
   GitHub unassigned-runner sentinel: `runner_id` null or `0`, `runner_name` null or empty, and
   `runner_group_id` null or `0`. These raw sentinel values normalize to runner identity null;
   `started_at` alone is not assignment evidence.
5. A missing exact run by 120 seconds, merge/head/base drift, a newly capable runner, any other
   nonterminal `cd.yml` run across any event/ref/status, cancellation failure, assigned runner,
   non-empty step list, or provider effect makes containment unproven or failed and enters the
   incident failure class below.

This cancellation is containment only. It grants no deployment authority and proves no deployment
or provider mutation is allowed.

### Normal success cleanup and resolver state

For each merge, success requires exact-merge-main required health, the CD containment result above,
no provider mutation, cleanup of only that merge's fresh branch/worktree, and branch-hygiene proof
showing no stale program branch or worktree remains:

| Merge               | Required exact-main health                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase A authority   | Governance-only tree equivalence; exact-head PR gates/reviews; post-merge Secret Scan, both dynamic CodeQL analyses, Sonar Main Gate; expected main CI absence; contained CD                          |
| R2 authority rebind | Governance-only tree equivalence; exact-head PR gates/reviews; post-merge Secret Scan, both dynamic CodeQL analyses, Sonar Main Gate; expected main CI absence; contained CD                          |
| A1 implementation   | Exact main CI including full unit/coverage and release units plus its required audit/static/E2E contracts; Secret Scan, both dynamic CodeQL analyses, Sonar Main Gate; contained CD                   |
| A1 closeout         | Governance-only tree equivalence against the four-path closeout map; exact-head PR gates/reviews; post-merge Secret Scan, both dynamic CodeQL analyses, Sonar Main Gate; expected main CI absence; CD |

| Merge               | Required canonical resolver state after cleanup                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 authority rebind | `awaiting_runtime_authority`; `runtime_authorized:false`; `activeSlice:null`; A1 runtime and every successor blocked pending exact R2 approval             |
| A1 implementation   | `runtime_authorized:false`; `activeSlice:null`; A2 and every successor blocked; A1 closeout required                                                       |
| A1 closeout         | `runtime_authorized:false`; `activeSlice:null`; `blocked_requires_current_authority`; A2 blocked pending independent exact-main admission/runtime approval |

The cleanup receipt binds the exact squash SHA, base/head/sole-parent/tree identities, main-health
run IDs, terminal CD cancellation state, raw and normalized runner-unassigned/steps-empty
observations, deleted branch/worktree identities, branch-hygiene result, and the canonical resolver
state. Cleanup never mutates a deployment or external provider.

### A1 and A2 success boundaries

After the A1 implementation merges and exact main is healthy, shadow evidence collection continues
with full PR unit still required. A1 success closeout may merge only after S1, S2, and S3 are frozen
and green; a failure closeout may merge earlier when a preauthorized failure class applies. Neither
closeout grants A2 authority. Only a later S3-backed, independently admitted and approved A2 may
request promotion. After A2 eventually closes successfully, `runtime_authorized:false`,
`activeSlice:null`, and all successors blocked are terminal; no third tranche is selectable from
this gate.

### Authority or convergence failure after Phase A, A1 implementation, or A1 closeout

If current program, tracker, admission, receipt, exact-main identity, or closeout cannot converge,
preserve exact merge/run evidence, set `runtime_authorized:false`, set `activeSlice:null`, block A2
and every successor, consume any active runtime authority, and stop for separate current-authority
incident repair. No automatic retry or inferred promotion is allowed.

### Exact-main health failure after Phase A, A1 implementation, or A1 closeout

If any signal required by the merge-specific health matrix above fails or is missing, preserve the
exact base, reviewed head, squash SHA, tree, run IDs, receipts, and logs. A skipped or absent
main-push CI is expected only for the three governance-only writer maps; it is failure for A1
implementation. Merge the preauthorized sanitized failure closeout when safe. At most one
separately reviewed mechanical exact-revert PR may contain the implementation merge only while it
is the most recent merge touching its writer paths. Revert is containment, not closeout; all
successors remain blocked until canonical failure closure merges.

### CD or provider-containment failure

If the matching `cd.yml` run is not terminal `cancelled` with raw unassigned-runner sentinel values
normalizing to runner identity null and `steps:[]`, or if any deployment, repository-variable
mutation, external provider call, or hidden activation occurs, preserve exact observed state,
classify provider state as unknown, perform no provider cleanup mutation or automatic retry, set
`runtime_authorized:false`, set `activeSlice:null`, block every successor, and stop for separate
incident authority. Cancellation is never deployment authority.

### Evidence or cleanup failure

If receipt upload, evidence persistence, branch/worktree cleanup, artifact cleanup, branch-hygiene
proof, or canonical closeout cleanup fails, preserve remaining evidence and dirty state exactly, do
not conceal or repeatedly retry cleanup, set `runtime_authorized:false`, set `activeSlice:null`,
block every successor, and stop for separately authorized cleanup/incident repair. Missing A1
evidence permanently blocks A2 under this gate.

### Successor-promotion failure

Any attempt to activate A1 without the separate byte-exact R2 approval, promote A2 without its
independent exact-main admission and approval, or create a third tranche is a terminal authority
failure: deauthorize, clear active slice, block all successors, preserve evidence, and stop.

## Review and freeze policy

Semantic completion precedes factual Git/workflow/API audit. The repository-pinned formatter runs
in WRITE then CHECK mode on both candidates before hashes. Admission, writer/line counts, JSON,
diff, and secret checks must be green before one ordinary GPT-5.6 Sol High review. Findings are
consolidated once; any edit restarts formatting and all mechanical checks. Exact UTF-8 bytes and
SHA-256 freeze only after clean review. Human approval is a later hold and is not requested by this
candidate-generation task.
