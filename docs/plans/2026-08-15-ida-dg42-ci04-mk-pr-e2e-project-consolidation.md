# IDA-DG42 — CI04 MK PR E2E Project Consolidation

Status: reviewed candidate; no exact approval, promotion, runtime, writer, branch, or mutation authority

Date: 2026-08-15

Authority base: `39067ccee9cef66da3958913f2caf47bd3c61ab7`

Classification: governance / CI and E2E infrastructure, not a product slice

Risk tier: 3 — exact-head browser coverage and evidence identity

## Decision candidate

Promote exactly one bounded governance slice:
`IDA-CI04-MK-PR-E2E-PROJECT-CONSOLIDATION`.

The canonical PR and PR-fast E2E lanes must execute ordinary MK gate coverage
once through `gate-mk-contract`. The separate `gate-mk-mk` execution must be
removed only from the normal, no-extra-argument PR lanes. Full `gate`,
`gate-fast`, standalone MK, merge, smoke, setup, and every project definition
remain unchanged. A manual PR-lane invocation carrying an `/pilot/` argument
must retain `gate-mk-mk`, because only its pilot-matrix match owns those extra
isolation specs; this is preservation, not Pilot expansion.

The exact project-name consumer in admin tenant classification must use a new
two-name gate-only allowlist so `gate-mk-contract` performs the real MK
classification case rather than returning early. The allowlist must reject
`ks-sq`, `mk-mk`, `smoke`, Pilot, and arbitrary names; the broader fallback
`getTenantFromTestInfo` is forbidden here because it would activate real DB
cases in merge/regression/smoke projects. This is contract closure for the lane
consolidation, not new test coverage.

Exact-main browser reuse must remain admitted. Its CI01 resolver must recognize
the exact, config-pinned semantic replacement
`gate-mk-mk -> gate-mk-contract`, while remaining fail-closed for every other
project/config/lane drift. This is a necessary safety consumer of the same lane
change: without it, the saved PR work would reappear as a larger main browser
run. No workflow or reuse-evidence identity rule changes.

This is one operational outcome, one repository-owned cause, and one rollback.
It is the first bounded shadow-contract observation using an explicit
hypothesis, primary metric, guardrails, failure taxonomy, and terminal
KEEP/REVERT/INCONCLUSIVE rule. It is not a product slice, does not alter the R2
decision, and makes no product-cycle ROI claim.

## Verified starting checkpoint

- Session integrity is clear. AI OS observation
  `d45bb33b18fb60a517be9ea3467f509e8c13f57b0a1959c94cb6e87a0552d74f`
  reports Brain `current`, Integrity `clear`, Interdomestik authority `current`,
  `activeSlice=null`, and runtime `not_authorized`.
- Repository `main == origin/main ==` live protected GitHub main
  `39067ccee9cef66da3958913f2caf47bd3c61ab7`, ahead/behind `0/0`, clean,
  with no active Interdomestik writer or open product/governance implementation
  PR.
- Resolver is correctly `blocked_requires_current_authority`, reason
  `umbrella_without_concrete_promoted_slice`, `activeSlice=null`.
- CI03 is terminally closed. Current program Rev 238 promotes no successor.
- The only additional worktree/branch is Arben's explicitly preserved
  `codex/interdomestik-infra-upgrade-roadmap` at
  `9d1f40b929a8b3e8dc676472719145e2064cda79`; it is not a writer for this task.
  Preflight/scorecard branch-namespace warnings are therefore classified as a
  known allowlisted user-owned false positive, not cleanup authority.
- Repo MCP is declared but unavailable as a callable tool in this runtime;
  bounded read-only shell inspection is the recorded fallback.

## Exact gap and empirical baseline

Root `scripts/run-e2e-lane.mjs` currently defines:

- `gate` and `gate-fast`: `gate-ks-sq` plus `gate-mk-mk`;
- `pr` and `pr-fast`: `gate-ks-sq`, `gate-mk-contract`, and `gate-mk-mk`.

`apps/web/playwright.config.ts` proves that, without the separately gated pilot
matrix, `gate-mk-contract` and `gate-mk-mk` have equal effective test matches:
both contain the default `gate/**/*.spec.ts` glob and the security matches. The
contract list repeats seed-contract and tenant-resolution explicitly, but both
are already included by the default glob. Both projects use the same MK host,
locale, forwarded host, and MK storage state; neither declares a Playwright
project dependency because the stateful runner performs setup before the gate.
When an
`/pilot/` argument activates `RUNNING_PILOT_MATRIX`, only `gate-mk-mk` adds the
three pilot isolation specs; the runtime contract therefore retains that
project for such manual invocations.

The current sources are byte-identical to implementation PR `#1566` head
`15c38daddd6a769fe24248ab3c8e4e8de67e4eea`, so its exact-head run is a valid
before baseline. GitHub run `31883005272`, job `95008119335`, attempt 1 passed.
Its immutable `pr-gate` evidence reports:

- report SHA-256
  `5a155db4d6bdea59b55842e5ce454f72646ba94f2b3620d6ea31b670f24eb3ac`;
- 360 total outcomes: 343 passed and 17 skipped;
- `gate-ks-sq`: 120 outcomes, 117 passed / 3 skipped, 282.966 seconds;
- `gate-mk-contract`: 120 outcomes, 113 passed / 7 skipped, 280.791 seconds;
- `gate-mk-mk`: 120 outcomes, 113 passed / 7 skipped, 296.777 seconds; and
- whole Playwright gate duration: 869.285 seconds (14.5 minutes).

The two MK projects therefore repeat 120 ordinary MK outcomes. The extra
`gate-mk-mk` execution is one third of all reported outcomes and accounts for
296.777 seconds of serial browser execution in this baseline.

Exact-main CI run `31884165133` is the before-side reuse baseline: it admitted
the exact PR evidence, reran DB/RLS proof, and skipped only the already-proven
browser suite. The combined before metric is therefore content-addressed as
`360 PR outcomes + 0 main browser outcomes`.

One project-name-dependent exception prevents a blind deletion:
`admin-tenant-classification-gate.spec.ts` recognizes MK only when the project
name equals `gate-mk-mk`. Under `gate-mk-contract`, both registered cases return
early and are reported as passing rather than executing the MK reassignment
proof. The established two-name allowlist shape in
`member-vault-consent-display.fixture.ts` proves the narrow fix: a dedicated
gate-project helper must accept only `gate-mk-mk` and `gate-mk-contract`.

A second load-bearing consumer prevents a lane-only edit:
`scripts/ci/main-e2e-reuse.mjs` currently admits exact PR evidence only when the
PR project-name set is a strict literal superset of the main gate set and when
the lane source matches an authorized SHA-256. Removing the literal MK project
without updating this consumer would set reuse to false and run the complete
main browser gate after merge. The existing `e2e-lane-runner-contracts` and
`main-e2e-reuse-cli` suites also pin the three-project lane and source digest.
They are required writers, not optional follow-up.

Two additional consumers are inventoried and remain read-only:
`apps/web/package.json` already defines package-level PR lanes as only KS plus
MK-contract and `scripts/package-e2e-scripts.test.mjs` pins that fact;
`scripts/release-gate/v1-required-specs.json` pins KS plus legacy MK only for
the separate release-candidate path and is unaffected by PR consolidation.

## Shadow contract: one falsifiable hypothesis

### Operational outcome

Every exact-head PR runs one complete KS gate and one complete MK contract gate,
retaining all current setup, security, seed, tenant-resolution, reporting, and
admin-classification proof while no longer paying for a second ordinary MK run.

### Hypothesis

On the first valid exact-head PR E2E after implementation, with the E2E test
inventory unchanged by this slice, canonical no-extra-argument `pr-gate`
evidence will contain exactly `gate-ks-sq` and `gate-mk-contract`, report 240
total outcomes rather than 360, and record zero `gate-mk-mk` outcomes. The
exact-main reuse resolver will still admit that content-addressed PR evidence,
so main will rerun DB/RLS proof but not the already-proven browser suite. All
240 expected outcomes will pass or retain their documented skip status without
retry or quarantine, while focused source and unit contracts prove that the real
MK admin case is selected and non-gate projects remain excluded.

This is falsified by any third project, any total other than 240, any missing
required spec/contract, any admin-classification early return under the MK
contract project, any non-gate project activation, any failed/retried/
quarantined outcome, or exact-main reuse rejection caused by the authorized
lane/config identity.

### Primary and secondary metrics

Primary metric: combined canonical browser outcomes for the PR plus its exact
main merge, before `360 + 0 reused = 360`, target
`240 + 0 reused = 240`, a direct reduction of `120` duplicate MK executions
(`33.33%`) without moving work to main. PR outcome count comes from the
content-addressed report; main reuse comes from the exact resolver decision and
CI step disposition.

Secondary diagnostic: Playwright gate wall time, before `869.285` seconds. The
removed project's measured serial span is `296.777` seconds. Timing is reported
honestly but is not solely attributed to the change because host load, cache,
setup, and test variance remain external factors.

### Decision rule

- `KEEP`: one exact-head report has exactly the two intended projects and 240
  outcomes, exact-main reuse remains `exact_pr_evidence`, every coverage/setup/
  reporting/security guardrail passes, no retry or quarantine occurs, and
  exact-main health remains green.
- `REVERT`: a coverage, setup, reporting, tenant-classification, security,
  exact-head identity, or required-gate regression appears; the project set or
  total is wrong on a valid comparable run; or the lane can false-pass.
- `INCONCLUSIVE`: the run is not comparable because of stale head, changed E2E
  inventory, runner/resource/network failure, GitHub evidence/API failure, or
  retry/quarantine. Do not claim savings; correct only the failing environment
  or evidence dependency and rerun only invalidated proof.

One observation is enough to decide this exact deterministic lane contract; it
does not generalize to product-cycle ROI or justify another CI change.

## Frozen writer maps

### Authority-publication writers

- `docs/plans/2026-08-15-ida-dg42-ci04-mk-pr-e2e-project-consolidation.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

These docs-only writers grant no runtime.

### Repository runtime writers

- `scripts/run-e2e-lane.mjs`
- `scripts/ci/e2e-lane-runner-contracts.test.mjs`
- `scripts/ci/main-e2e-reuse.mjs`
- `scripts/ci/main-e2e-reuse-cli.test.mjs`
- `apps/web/e2e/gate/admin-tenant-classification-gate.spec.ts`
- `apps/web/e2e/gate/gate-project-identity.ts` (new, below 150 lines)
- `scripts/ci/gate-project-identity-contract.test.mjs` (new, below 150 lines;
  collected by `pnpm test:ci:contracts`)
- `scripts/repo-size-budget.json` only when deterministic tracked size changes
  require it

Maximum runtime writers: eight including conditional size metadata. The
141-line `main-e2e-reuse.mjs` projects to 145 lines: two config-pin lines, one
config-hash conjunct, and one config input replace the existing project check
without net growth. The 147-line `main-e2e-reuse-cli.test.mjs` projects to 149
lines: one source-key line and one config-drift row; existing digest, lane, and
expected-parity rows are replaced in place. Both must finish at no more than
149 lines; `wc -l` is a focused gate and any overflow stops before commit. The
281-line grandfathered `scripts/package-e2e-scripts.test.mjs` stays read-only.

The parity object key remains literally `projectSuperset` even though it now
means the one authorized semantic replacement. `main-e2e-reuse-core.mjs`,
`main-e2e-reuse-fixture.mjs`, and `main-e2e-reuse-core.test.mjs` pin that key
and remain read-only.

No Playwright config, workflow, package script, setup project, evidence
collector, Pilot spec/config, Sonar, product, database, proxy, global skill,
AGENTS, template, validator, AI OS, Brain, Docker, runner, provider, deployment,
or production file may be added. Discovery that another writer is necessary
stops and re-gates.

## Exact lane and project-name contract

1. `pr` remains stateful and `pr-fast` remains stateless; in canonical
   no-extra-argument use both pass exactly
   `[gate-ks-sq, gate-mk-contract]` to the unchanged gate executor.
2. `gate` and `gate-fast` retain exactly `[gate-ks-sq, gate-mk-mk]`.
3. If a manual `pr`/`pr-fast` invocation contains an `/pilot/` path argument,
   the runner adds `gate-mk-mk` back exactly once after lane lookup by mutating
   only that invocation's `lane.playwrightArgs`; no Pilot spec, match, or
   dedicated lane changes. The `pr` definition must remain the static parser-
   compatible literal `gateLane([ksSq, mkContract], true)` and `pr-fast` the
   static two-identifier `gateLane([ksSq, mkContract])`; no spread, ternary, or
   helper call may enter either literal array.
4. Every other lane definition and runner behavior is byte-for-byte unchanged.
5. `gate-mk-mk` remains a configured and callable project. This slice neither
   renames nor deletes it.
6. Admin tenant classification uses a dedicated gate-only helper: KS accepts
   only `gate-ks-sq`; MK accepts only `gate-mk-mk` and `gate-mk-contract`.
   Focused Vitest and source-wiring contracts reject merge/regression/smoke and
   arbitrary names.
7. Exact-main reuse continues fail-closed. It accepts only the exact main set
   `[gate-ks-sq, gate-mk-mk]` and exact PR replacement set
   `[gate-ks-sq, gate-mk-contract]`, pinned to the authorized lane-source and
   Playwright-config SHA-256 values. Any other project, config, lane, command,
   workflow, DB, head, report, or evidence drift rejects reuse.
8. The canonical report must list exactly two PR-gate projects and preserve the
   existing spec inventory, retry, quarantine, report hash, and head identity
   semantics. No evidence collector change is required.
9. The first exact-head PR E2E is the only full browser run on that head.

## Guardrails

### Coverage

- `gate-mk-contract` retains all default MK and security matches and adds the
  two existing contract paths redundantly already covered by the default glob.
- The collected source-wiring contract is the fail-closed detector for real MK
  admin selection: it pins the helper's exact allowlists, import/use, and rejects
  `.includes(` and `getTenantFromTestInfo`. Exact-head E2E is corroborating only
  because the current evidence schema cannot distinguish execution from the
  prior annotation-and-return pass.
- Merge/regression/smoke projects remain excluded by the exact helper, and
  manual `/pilot/` PR invocations retain the legacy MK project and pilot matrix.
- No test, match pattern, tag, skip, quarantine, assertion, selector, or timeout
  changes.

### Setup and identity

- Existing `setup-ks`/`setup-mk`, stateful/state-free lane distinction,
  `GATE_MK_STATE`, MK host/locale/header, one worker, max-failure, doctor, DB,
  RLS, and auth behavior remain unchanged.
- Exact PR head and report SHA remain mandatory. Stale-head evidence is invalid.
- Exact-main reuse parity is independently tested against lane, config,
  workflow, DB, command-chain, head, tree, report, and remote evidence drift.

### Reporting and gates

- Existing `playwright-lane-evidence` collection and summary schema remain
  unchanged; actual exact-head evidence must prove the two-project list and 240
  total.
- `pnpm pr:verify`, `pnpm security:guard`, one exact-head full PR E2E, gitleaks,
  audit, CodeQL, Sonar, finalizer, reviewer/Copilot feedback, unresolved-thread
  intake, and exact-main health remain authoritative.
- No independent security, RLS, finalizer, main-health, or review evidence is
  removed or reclassified as duplicate.

### Disk discipline

- Check-first baseline: data volume has `21,905,884 KiB` free; repository root
  is `2,663,312 KiB`; AI OS runtime is `27,587,088 KiB`; this task's durable
  artifact directory is `0 KiB`; ignored authority/review temp is `232 KiB`.
- Do not create duplicate installs, dependency caches, or worktrees. Use the
  existing dependency runtime read-only where repo policy permits. One fresh
  implementation worktree is the sole later exception required by lifecycle.
- Run exactly one full exact-head E2E; rerun only when head/environment/evidence
  is invalidated. No extra AI OS refresh, publication, or retry.
- Do not browse AI OS runtime roots with Finder or create runtime metadata.
- Closeout records free disk, repo/worktree bytes, task artifacts, and AI OS
  runtime before/after. Trash is recoverable but does not reclaim space; no
  cache/runtime/AI OS/Trash deletion, purge, quarantine, move, or retention
  change is authorized by this gate.

## Failure taxonomy

- `coverage_regression`: unique spec, assertion, security, seed,
  tenant-resolution, or real admin-classification proof is missing.
- `project_identity_drift`: a project name maps to the wrong tenant or a guarded
  case returns early/false-passes.
- `setup_or_auth_state`: setup dependency, storage state, host, locale, header,
  DB, or RLS precondition differs.
- `reporting_or_identity`: report project list/count/hash/head is missing,
  malformed, duplicate, or stale.
- `orchestration`: wrong lane set, statefulness, worker, max-failure, or runner
  semantics.
- `reuse_parity`: authorized semantic replacement, lane/config digest,
  workflow/DB/command parity, or exact PR evidence fails and main browser work
  would be restored; this includes any non-literal `pr` array or Pilot
  augmentation performed inside the parser-owned lane definition.
- `environment_or_resource`: runner, disk, memory, network, DNS, or dependency
  failure without source regression.
- `flake_retry_quarantine`: any retry recovery, quarantine, timeout, or
  nondeterministic outcome invalidates the timing observation.
- `workflow_gate_or_feedback`: required CI, security, Sonar, CodeQL, finalizer,
  Copilot/reviewer, or unresolved-thread evidence fails.

## Contract graph and closure

- Entry: root `e2e:gate:pr` and `e2e:gate:pr:fast` package scripts.
- Primitive: `run-e2e-lane.mjs` PR project arrays and unchanged gate executor.
- Test selection: unchanged, non-pilot-equivalent Playwright
  `gate-mk-contract` match and preserved pilot-only MK augmentation.
- Identity consumer: admin tenant-classification gate through a narrow new
  gate-project allowlist.
- Reuse consumer: CI01 exact-main resolver with exact semantic project mapping
  and lane/config source pins.
- Evidence consumer: unchanged PR E2E report/evidence collector and finalizer.
- Baseline: PR `#1566` exact-head content-addressed report plus exact current
  source identity.
- Rollback: one content-addressed repository implementation revert.

Callers, shared consumers, read/write/delete behavior, mount/error paths,
capability requirements, test collectors, and baseline ownership are closed.
The implementation changes only in-repo lane selection and project identity
consumption. Browser report output remains ignored/transient; no product,
database, control-plane, provider, or production state is read or written.

## TDD and acceptance matrix

<!-- prettier-ignore-start -->
| ID | Required evidence | Command/environment | Invalidated by |
| --- | --- | --- | --- |
| A1 exact lane set | RED existing contract proves canonical `pr`/`pr-fast` have KS + MK-contract only, `/pilot/` augmentation retains MK, and `gate`/`gate-fast` retain KS + MK | `node --test scripts/ci/e2e-lane-runner-contracts.test.mjs` | runner or focused contract change |
| A2 project identity | collected source-wiring contract proves the helper's exact gate-only KS/MK allowlists, its import/use by admin classification, and rejection of broad resolver/substring predicates; exact-head E2E is corroborating only | `node --test scripts/ci/gate-project-identity-contract.test.mjs` plus exact-head E2E | helper, admin gate, focused contract, project/config, E2E head |
| A3 exact-main reuse | RED/green CLI contracts prove only exact semantic MK replacement with authorized lane/config hashes preserves reuse; every other drift rejects | `node --test scripts/ci/main-e2e-reuse-cli.test.mjs scripts/ci/main-e2e-reuse-core.test.mjs scripts/ci/main-e2e-reuse-workflow.test.mjs` | resolver, lane/config source, workflow/DB/command/evidence identity |
| A4 shadow metric and guardrails | exact-head evidence has two projects, 240 outcomes, no retry/quarantine; exact-main resolver reuses it while DB/RLS and all required gates pass | one canonical GitHub PR E2E, evidence JSON, and exact-main CI | runtime writer, E2E inventory, PR/main head, runner environment, report/reuse decision |
| A5 governed regression | all repository/security/reviewer/finalizer/Sonar/CodeQL and main-health evidence remains authoritative with zero unresolved feedback | repo-required exact-head PR and exact-main gates | PR head, source, feedback, external gate or main head |
| A6 rollback identity | pre-change tree and exact implementation revert are content-addressed; focused proof restores baseline | disposable worktree manifest/revert check | baseline hash, writer map, revert target |
<!-- prettier-ignore-end -->

Skipped A1-A6 evidence is failure.

TDD order:

1. Update existing RED lane/reuse contracts and add the collected RED gate-only
   identity source contract. Baseline failures must map only to the approved lane, semantic
   reuse, and false-pass gaps.
2. Change the two PR arrays with pilot preservation, add the narrow helper/use,
   and update the fail-closed reuse consumer plus exact source pins.
3. Run focused lane/identity/reuse suites, static/size contracts, and bounded
   senior review.
4. Open one PR and allow exactly one full exact-head PR E2E after feedback
   intake; rerun only proof invalidated by changed head/environment/finding.

## Focused and mandatory gates

Before PR:

- `node --test scripts/ci/e2e-lane-runner-contracts.test.mjs`
- `node --test scripts/ci/gate-project-identity-contract.test.mjs`
- `node --test scripts/ci/main-e2e-reuse-cli.test.mjs scripts/ci/main-e2e-reuse-core.test.mjs scripts/ci/main-e2e-reuse-workflow.test.mjs`
- `node --test scripts/ci/playwright-lane-evidence.test.mjs`
- `node --test scripts/package-e2e-scripts.test.mjs`
- `pnpm test:ci:contracts`
- `pnpm repo:size:check`
- `git diff --check`
- one bounded senior review of the complete current diff

Final repository contracts remain:

- `pnpm pr:verify`
- `pnpm security:guard`
- exactly one full exact-head PR E2E
- GitHub gitleaks, pnpm-audit, CodeQL, Sonar, finalizer, reviewer/Copilot
  feedback, and exact-main health

Mac is control plane/light writer and runs no Docker. GitHub-hosted Ubuntu is
the canonical full E2E environment. Z620 is not required for this deterministic
lane-selection slice unless runtime authority later names a governed supporting
canary; it never replaces GitHub merge authority.

## Senior review disposition

Priority Claude Opus 5 completed one bounded read-only review in 331.291 seconds
without timeout or resubmission and returned `REVISE`: three P1, three P2, and
three P3 findings. It proved the original five-writer candidate overlooked the
CI01 exact-main reuse invariant and two collected contract tests; a lane-only
edit would restore the full main browser run. It also proved the proposed broad
tenant resolver would activate DB cases in merge/regression/smoke projects,
that non-pilot MK match sets are equal rather than strict supersets, that Pilot
argument coverage needs preservation, and that raw outcome count cannot alone
prove the admin case executed.

One consolidated remediation now:

- owns the exact-main reuse consumer and its existing contracts atomically;
- pins the exact lane and Playwright config sources and accepts only the one
  semantic MK replacement while every other drift remains fail-closed;
- retains `gate-mk-mk` for manual `/pilot/` PR invocations;
- replaces the broad tenant resolver with a dedicated gate-only allowlist and
  unit/source-wiring proof;
- changes the primary metric from PR-only work to combined PR-plus-main browser
  outcomes; and
- expands the frozen map only to eight required paths, still within admission
  budget, with no workflow/config/Pilot/product/AI OS writer.

The same Opus 5 route re-reviewed the complete first remediation in 618.860
seconds and returned `REVISE`: one P1, three P2, and five P3 findings. Its P1
proved the proposed E2E-local Vitest file was outside every collector. Its P2s
required the source-wiring contract to be the fail-closed detector, Pilot
augmentation after parser-owned lane lookup, and computed line ceilings.

This second candidate addresses the complete R2 set without another writer or
outcome: the identity proof moves to collected `scripts/ci/*.test.mjs`, A2 makes
exact-head E2E corroborating only, parser shape and parity-key name are pinned,
post-change line counts are budgeted at 145/149, exact-main run `31884165133`
anchors the combined metric, and package/release consumers are inventoried.
The bounded two-review limit is consumed; no third model review is claimed.
Final disposition is `R2 REVISE findings addressed; no final model PASS
claimed`. Exact human approval may accept this explicit disposition for the
docs-only gate; repository focused checks, later current-diff review, CI,
security, finalizer, and exact-main evidence remain authoritative.

## Runtime sequence and approval separation

1. Exact approval of this immutable gate authorizes only a docs-only authority
   PR and merge; runtime remains false.
2. After merge, run one governed AI OS publication/check, preflight, resolver,
   scorecard, and exact writer/consumer inventory on then-current main.
3. Prepare a separate content-addressed runtime receipt bound to exact main,
   gate, task/worktree/branch, commands, writer map, metric, and rollback.
4. Only exact runtime approval may authorize one fresh worktree, one writer,
   implementation, focused TDD, PR, merge, measurement, and closeout.
5. Closeout records the exact before/after primary metric, diagnostic timing,
   failure taxonomy, decision, and rollback identity without product ROI claims.

No Brain product session or M7 enrollment is created for this governance/CI
slice. AI OS remains advisory and changes only through the task-owned governed
publication/check after stable repository evidence.

## Rollback and stop conditions

Rollback is the single atomic implementation merge revert. It restores the
three-project PR arrays, original exact-name admin predicate, original strict
literal reuse rule, and original source pins together, followed by focused
contracts, one valid exact-head E2E only when browser evidence was invalidated,
and exact-main health.

Stop and re-gate if:

- any writer outside the maximum eight paths is required;
- Playwright project config, match patterns, evidence collector, workflow,
  package scripts, setup/auth state, or full gate must change;
- non-pilot effective matches cease to be equal, Pilot augmentation is lost,
  or `gate-mk-contract` cannot execute the MK admin case;
- exact-main reuse does not admit only the pinned semantic replacement or would
  accept unpinned lane/config/project drift;
- the exact baseline is no longer comparable because E2E inventory changed;
- any security, RLS, finalizer, exact-head, review, or main-health gate would be
  removed, skipped, weakened, or reclassified;
- one exact outcome, one writer, rollback, approval/runtime separation, or
  current-head evidence cannot be preserved; or
- product, Pilot/dedupe, Sonar, AGENTS/template/validator, AI OS/Brain,
  deployment, production, provider, database, Docker, runner allocation, or a
  second slice appears.

## Explicit exclusions

- product UI/domain, routes/proxy, auth/session implementation, tenancy,
  membership, schema/RLS changes, billing, analytics, deployment, production;
- Playwright project rename/deletion, test removal, match/tag/skip/quarantine,
  timeout, worker, retry, setup, storage-state, host, locale, or selector changes;
- `package.json`, `apps/web/package.json`, `apps/web/playwright.config.ts`,
  `.github/workflows/**`, evidence collector/policy, Pilot Gate/spec/config,
  Sonar, CI01 evidence/core/workflow policy beyond the two named reuse consumer
  writers, CI02, CI03, R2, dependency PRs, local-full routing, cache, Docker,
  Z620 allocation, or runner infrastructure;
- README, AGENTS, architecture docs, global skills, templates, validators,
  AI OS/Brain controller/config/runtime, M1-M7, Atlas, or another slice.

## Approval hold

No gate promotion, branch, worktree, active execution, runtime receipt, code,
PR, or mutation is authorized until Arben exact-approves this artifact by gate
ID, UTF-8 byte count, SHA-256, and base main. After docs-only merge and governed
convergence, a separate exact runtime receipt and approval are mandatory.
