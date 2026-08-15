# IDA-DG43 — CI05 Pilot/Sonar Critical-Path Decoupling

Status: reviewed candidate; no exact approval, promotion, runtime, writer,
branch, worktree, or mutation authority

Date: 2026-08-15

Authority base: `c0e5b22a2d26c16e87a6615eac8604a5ba748cde`

Classification: governance / CI infrastructure, not a product slice

Risk tier: 3 — required-check orchestration and exact-head evidence timing

## Decision candidate

Promote exactly one bounded governance slice:
`IDA-CI05-PILOT-SONAR-CRITICAL-PATH-DECOUPLING`.

The Pilot Gate heavy runner must become eligible immediately after the existing
lightweight exact-head policy, certification, and secret admission completes.
It must no longer wait inside `pilot-gate-preflight` for the independent
`SonarCloud Code Analysis` context. Sonar remains an independent current-head
review/evidence requirement and is not removed, renamed, skipped, downgraded,
or declared duplicative.

For the current SonarCloud automatic-analysis route, the removed wait is not an
enforcement gate: it is `continue-on-error`, and the subsequent strategy
explicitly skips a manual fallback when the external check is incomplete.
Therefore it serializes the runner by as much as 36 × 10 seconds without making
Pilot fail on a SonarCloud result. This slice removes only that serialization.

Manual Sonar behavior remains fail-closed for the routes which actually own it.
Workflow dispatch retains the existing in-runner fallback. A configured
non-SonarCloud PR becomes deliberately more conservative: it runs that fallback
without first accepting a successful external poll as a substitute. This is a
bounded enforcement widening, not claimed preservation, and the timing
hypothesis below applies only when `SONAR_HOST_URL` contains `sonarcloud.io`.
The fallback command, Sonar script, tokens, coverage behavior, artifacts, and
runner ordering before database/build work do not change.

No unit-test deduplication is promoted. CI04 found a long unit critical path but
no direct duplicate test execution. Profiling stays a future candidate and may
not enter this writer map.

## Verified starting checkpoint

- Check-first AI OS observation
  `f3d5c96c9f05c1ffeb92fa03460066708070d2342c5ade9446be953f5b8f2c1c`
  reports Brain `current`, Integrity `clear`, and M1-M6 in their current
  governed states. No refresh or publication was run.
- Repository `main == origin/main ==` live protected GitHub main
  `c0e5b22a2d26c16e87a6615eac8604a5ba748cde`, ahead/behind `0/0`, clean.
- Resolver is `blocked_requires_current_authority`,
  `activeSlice=null`, runtime `not_authorized`.
- CI04 is terminally closed. Current program/tracker Rev 240 promotes no
  successor. R2 remains KEEP and is not reopened.
- The only other worktree is Arben's preserved
  `codex/interdomestik-infra-upgrade-roadmap` at
  `9d1f40b929a8b3e8dc676472719145e2064cda79`. It is not a writer for this
  task. Exact branch hygiene passes when that user-owned worktree is allowlisted.
- Repo MCP configuration exists, but the repo MCP was unavailable as a callable
  tool in this runtime; bounded read-only shell/GitHub inspection is the fallback.
- Disk baseline at selection is `19,118,484 KiB` available. This candidate
  creates no worktree, dependency install, cache, browser artifact, or runtime
  publication before approval.

## Exact current dependency and consumers

`.github/workflows/pilot-gate.yml` currently performs these operations serially:

1. lightweight checkout, policy, exact-head certification, and secret checks;
2. `Await SonarCloud Code Analysis check` with 36 retries × 10 seconds and
   `continue-on-error: true`;
3. a strategy step which skips manual fallback for SonarCloud automatic analysis;
4. only then, `pilot-gate-runner`, including Postgres, setup, build, and P0 gate;
5. stable required wrapper `pilot-gate` after preflight and runner.

The runner consumes only `run_broad`, the secret/fallback outputs, and the
manual-fallback decision. It does not consume the successful Sonar report. The
required wrapper checks preflight and runner results, not the Sonar conclusion.
PR Sonar is already advisory rather than a branch-protection context: the Pilot
wait is `continue-on-error`, CI finalizer checks do not make absence blocking,
and a local finalizer can pass when no Sonar check has materialized. The frozen
baseline does, however, normally order Sonar completion before Pilot completion.
This slice gives up that ordering, not an enforcement verdict. The exact-head
governance report must therefore record `SonarCloud Code Analysis` as completed
and non-`missing` before merge. `scripts/sonar-check-run-gate.sh` remains owned
by the main Sonar gate and stays read-only; no uploaded runner artifact is lost
because the removed preflight wait wrote only to its job log.

The exact implementation is deliberately smaller than adding a new parallel
observer job. The preflight removes only the external wait. Its strategy derives
manual-fallback ownership directly from event and host:

- pull request + SonarCloud automatic analysis: no in-runner manual fallback;
- workflow dispatch + enabled Sonar: existing manual fallback;
- pull request + enabled non-SonarCloud host: the existing manual fallback runs
  conservatively on every broad PR, a deliberate fail-closed widening;
- disabled/missing Sonar configuration: existing warning/disabled disposition.

This keeps current SonarCloud behavior and strengthens the unusual non-cloud PR
route by running the already-existing manual proof rather than allowing an
external-poll failure to control runner admission.

## Shadow contract: one falsifiable hypothesis

### Operational outcome

On a broad exact-head PR, Pilot's database/build/P0 runner starts after its own
lightweight admission rather than after an unrelated SonarCloud polling delay,
while every Pilot, Sonar, security, reviewer, and finalizer verdict remains
independent and authoritative.

### Hypothesis

On the first comparable broad exact-head implementation PR using SonarCloud,
focused source proof will show that no external Sonar poll remains in preflight.
The observed elapsed time from completion of `Validate required gate secrets`
to start of `Pilot Gate Runner` should fall from the 96/294-second baselines
toward the measured 7/8-second residual. A 45-second sanity band is allowed only
as hosted-runner queue headroom; it is not the structural proof. When the exact
same-head Sonar check completes after runner start, their GitHub timestamps must
prove overlap. The stable `pilot-gate` wrapper, explicit Sonar disposition,
manual fallback routes, policy skip behavior, runner P0 proof, and all required
checks retain their prior pass/fail semantics.

This is falsified by a dependency edge which still waits for Sonar, admission
latency above 45 seconds without an independently evidenced GitHub queue delay,
loss of current-head Sonar evidence, a changed required-check name, a missing
manual fallback on dispatch/non-cloud configuration, heavy work on a skipped
lane, or any fail-open aggregator/finalizer behavior.

### Primary and secondary metrics

Primary metric: deterministic source/contract result that
`pilot-gate-preflight` contains no `Await SonarCloud Code Analysis check`, no
`SONAR_CHECK_MAX_RETRIES`, no `sonar-check-run-gate.sh`, and no dangling
`await_sonar_check` reference while the runner still needs preflight.

Two live broad baselines on the unchanged dependency graph are:

- PR `#1566`, run `31883005269`: validation completed
  `2026-08-15T11:49:32Z`; runner started `11:51:08Z`; admission latency
  `96 seconds`; Sonar wait step `89 seconds`; whole Pilot workflow `609 seconds`.
- PR `#1570`, run `31892724346`: validation completed
  `2026-08-15T15:26:57Z`; runner started `15:31:51Z`; admission latency
  `294 seconds`; Sonar wait step `286 seconds`; whole Pilot workflow
  `794 seconds`.

Secondary diagnostic: validation-to-runner latency. The baselines decompose to
7 and 8 seconds after subtracting the Sonar wait, so the expected result is at
most 20 seconds. Up to 45 seconds is reported as acceptable queue headroom only
when the structural proof passes; queue provisioning is an uncontrolled part of
this cross-job interval. Overlap is proven only when the exact-head runner
`startedAt` is earlier than the SonarCloud check `completed_at`. Whole Pilot
workflow wall time is reported but not fully attributed because GitHub queue,
cache, build, provider, and runner variance remain external. This gate makes no
product-cycle ROI claim.

### Decision rule

- `KEEP`: deterministic contracts prove complete removal of the serial wait;
  one comparable SonarCloud PR records the secondary timing/overlap evidence;
  stable check identities, explicit completed/non-missing current-head Sonar,
  manual fallback, skip policy, P0, security, review, and finalizer guardrails pass.
- `REVERT`: Sonar disposition becomes less observable than the frozen advisory
  baseline; any required
  check identity or wrapper contract changes; manual fallback is lost; a skipped
  lane starts heavy work; or Pilot can pass despite its own admission/runner
  failure.
- `INCONCLUSIVE`: GitHub queue/resource/API instability prevents a comparable
  timestamp observation while all safety contracts remain intact. Record no
  speed claim and repeat measurement only on a later naturally required broad
  PR; do not manufacture another full run.

## Frozen writer maps

### Authority-publication writers

- `docs/plans/2026-08-15-ida-dg43-ci05-pilot-sonar-critical-path-decoupling.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

These docs-only writers grant no runtime.

### Repository runtime writers

- `.github/workflows/pilot-gate.yml`
- `scripts/ci/workflow-contracts.test.mjs`
- `scripts/ci/z620-parity.json` (only the Pilot workflow SHA-256 literal)

Maximum runtime writers: three. The base workflow digest is
`0dc053943c6a8012d852ade33a9b111347826ec5eef53df0469add30b0c506c3`;
the parity literal must be recomputed for the new bytes and reverted atomically
with them. `pnpm repo:size:check` decides size admissibility; because this is a
net-deleting workflow change, runtime size metadata is expected to remain
unwritten. No new workflow, script, action, package command,
test collector, provider integration, or runtime dependency may be added.
Discovery that another writer is necessary stops and re-gates.

## Explicit exclusions and protected surfaces

- no product UI/domain behavior, route, proxy, auth/session, tenancy, schema,
  RLS, billing, analytics, deployment, production, or database mutation;
- no unit-test profiling or deduplication and no CI04/R2 reopening;
- no change to `scripts/sonar-check-run-gate.sh`, `sonar-main-gate.yml`, Sonar
  project/configuration, coverage, issue rules, tokens, or provider settings;
- no removal or rename of `pilot-gate`, Sonar, CodeQL, gitleaks, pnpm audit,
  security guard, E2E, finalizer, or main-health evidence;
- no AGENTS/template/validator/global-skill/Brain/AI OS changes;
- no Pilot P0 specs, assertions, seed/setup, Postgres, build, auth secret,
  artifact, timeout, or release-gate changes;
- no new M6/M7 cohort, deployment, provider, or production authority;
- no second slice.

`apps/web/src/proxy.ts`, canonical routes, and all `*-page-ready` markers remain
read-only and untouched.

## Guardrails

### Coverage and admission

- `run_broad` remains the sole heavy-run admission output from the pinned
  exact-head certification action.
- Docs/non-product/draft policy skips continue to materialize the stable wrapper
  without starting Postgres/setup/build/P0 work.
- Secret validation must still finish successfully before the runner becomes
  eligible.
- The runner retains `needs: pilot-gate-preflight`; only the Sonar polling step
  leaves that prerequisite.

### Sonar and failure semantics

- SonarCloud Code Analysis remains monitored against the exact PR head before
  merge through `pnpm pr:governance:report`; it must be completed and non-missing.
  A failed, stale, missing, or unresolved Sonar result is not accepted evidence.
- Workflow dispatch retains, and non-SonarCloud PRs conservatively always run,
  the existing `bash scripts/sonar-gate.sh` fallback before DB/build work.
- Sonar-disabled configuration remains explicitly reported; this slice does not
  decide whether repository policy should require provider configuration.
- The stable `pilot-gate` wrapper still fails if preflight or runner fails.

### Verification and storage

- TDD starts with RED workflow contract assertions proving the wait, retry env,
  script invocation, and dangling step reference are absent; the strategy step
  remains unconditional and writes explicit `false` on the skip path; the
  existing runner-side dispatch clause remains verbatim; conservative non-cloud
  fallback ownership is explicit; runner still depends on preflight; and wrapper
  and check names are unchanged.
- Focused proof precedes required gates. One exact-head PR E2E is allowed only
  if the repo validation surface requires it; reruns require invalidation.
- No Mac Docker, duplicate install/cache, AI OS refresh/publication, or Z620
  heavy work is needed for this workflow-only change.
- Closeout records disk and task-artifact growth. No purge, Trash emptying,
  cache/runtime deletion, or retention-policy change is authorized.

## Failure taxonomy

- `dependency_regression`: runner still waits for Sonar or loses preflight admission.
- `sonar_fail_open`: exact-head Sonar failure/missing/stale evidence is treated as green.
- `fallback_regression`: dispatch or non-SonarCloud manual fallback is skipped.
- `skip_policy_regression`: non-product/draft work starts the heavy runner.
- `wrapper_identity_regression`: stable `pilot-gate` context or aggregator logic drifts.
- `pilot_behavior_regression`: setup, DB, build, P0, report, or artifact behavior changes.
- `workflow_gate`: YAML/expression/action pin/contract validation fails.
- `environment_or_resource`: hosted runner, queue, network, API, disk, or provider issue.
- `stale_head_evidence`: measurement/review/checks refer to a non-current head.
- `reviewer_feedback`: current-head reviewer, Sonar, CodeQL, or thread finding.

## Contract graph and closure

- Entry: pull request/workflow-dispatch events in `pilot-gate.yml`.
- Admission primitive: pinned gate-policy and exact-head certification actions.
- State: `run_broad`, Sonar-enabled, provider-host, and fallback outputs.
- Heavy consumer: `pilot-gate-runner` with Postgres/setup/build/P0.
- Independent consumer: exact-head SonarCloud check and final feedback lifecycle.
- Required consumer: stable `pilot-gate` wrapper.
- Test consumer: focused workflow contracts plus unchanged governance/action-pin
  suites and exact-head GitHub run timestamps.
- Baseline: content-addressed main and runs `31883005269`/`31892724346`.
- Rollback: exact revert of the one implementation merge.

Callers, shared consumers, read/write/delete behavior, error paths, capability
requirements, test collectors, and baseline ownership are closed. Workflow
execution and transient GitHub artifacts are the only state affected; no
product, data, provider configuration, or production state is written.

## Acceptance matrix

| ID | Criterion | Focused/remote proof | Expected |
| --- | --- | --- | --- |
| A1 | No serial Sonar wait | `node --test scripts/ci/workflow-contracts.test.mjs` | Preflight has no await step, retry env, script invocation, or dangling reference; runner still needs successful preflight. |
| A2 | Fallback ownership preserved or stricter | Same focused suite | Strategy remains unconditional/explicit on skip; dispatch clause remains verbatim; non-SonarCloud PR is conservatively manual; SonarCloud PR does not duplicate analysis. |
| A3 | Stable gates and skips | Workflow/governance/draft/action-pin contracts | `pilot-gate` name/aggregator, policy skips, pins, permissions, and runner admission remain intact. |
| A4 | Falsifiable structure and timing | Focused contract plus first comparable exact-head SonarCloud Pilot run | Structural wait removal passes; expected latency ≤20s, ≤45s only as queue headroom; overlap is runner start before same-head Sonar completion when intervals permit. |
| A5 | Exact-head lifecycle | Repo-required CI/security/CodeQL/feedback/finalizer/main health plus `pnpm pr:governance:report` | Sonar is completed/non-missing on the exact head and no evidence is removed, stale, unresolved, or inferred from another head. |
| A6 | Rollback | Disposable exact revert plus focused contracts/parity test | Revert atomically restores workflow and parity literal to `0dc053943c6a8012d852ade33a9b111347826ec5eef53df0469add30b0c506c3`. |

Skipping any acceptance row is failure for promotion or merge. Exact-head E2E
is run once only if the validation surface requires it; a policy-authorized skip
is recorded, not misreported as a run.

## Highest-risk cases

1. Pilot starts before exact-head path/secret admission.
2. Sonar becomes implicitly optional because Pilot finishes first.
3. Non-SonarCloud or dispatch fallback silently disappears.
4. Docs-only/draft work starts Postgres/build/P0.
5. Wrapper/check identity changes and branch protection stops matching.
6. GitHub queue delay is falsely credited as implementation regression/saving.
7. Unit-test deduplication or broader CI redesign enters the diff.

## Rollout, rollback, and stop conditions

Rollout is one repository workflow/test PR. There is no deployment or production
rollout. Merge authority requires exact current-head focused contracts, repo
required checks, Sonar, CodeQL, security, feedback/finalizer, and one valid Pilot
timing observation.

Rollback is the exact revert of the single implementation merge, atomically
restoring both workflow bytes and `scripts/ci/z620-parity.json` to the pinned
base digest, followed by focused workflow/parity contracts and exact-main
health. Revert immediately if Sonar becomes less observable than the baseline,
fallback is lost, heavy-work skip regresses, required-check identity drifts, or
the aggregator mismatches.

Stop and re-gate before mutation if another runtime writer, provider/config
change, new job/workflow, branch-protection change, Sonar enforcement redesign,
unit-test dedupe, or product surface becomes necessary.

## Review and runtime separation

Because this is Tier 3 CI orchestration, one bounded senior design review is
required before exact approval. It is advisory and cannot replace repository
gates or Arben's exact-hash approval.

Claude Opus 5 ran through the governed read-only `Read,Grep` packet route. The
first review completed in 336.041 seconds with `REVISE`: one P1, four P2, and
two P3 findings. One consolidated remediation added the required Z620 parity
digest writer, made the non-SonarCloud behavior explicitly stricter, corrected
the advisory Sonar observability baseline, required a completed/non-missing
governance-report disposition, strengthened negative TDD assertions, made
structural proof primary, and pinned rollback to the exact base digest.

The same priority route re-reviewed the remediated packet and current repository
sources in 229.371 seconds and returned `PASS` with no remaining P1/P2/P3
finding. Both calls completed normally without timeout or quota blocker. The
reviewer could not read the external task-artifact path directly, so its stated
scope was the complete worktree-local packet containing the exact decision,
writer map, metrics, acceptance, remediation, and hashes plus direct `Read,Grep`
inspection of every identified repository consumer. This scope caveat is
preserved and the review remains advisory.

Exact approval of this artifact authorizes only a docs-only authority PR. After
that PR merges, the task must rerun check-first/resolver/scorecard and prepare a
separate content-addressed runtime receipt on exact main. No branch, worktree,
active execution, implementation, or product session may begin before that
runtime receipt is exact-approved.
