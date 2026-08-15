# IDA-DG41 — CI03 Shared-auth Canonical Remote Coverage

Status: reviewed candidate; no exact approval, promotion, runtime, writer, branch, or mutation authority

Date: 2026-08-15

Authority base: `0ac4a720e08d627b25454053173d0e99944055c7`

Classification: governance / CI infrastructure, not a product slice

Risk tier: 3 — canonical remote coverage of an authentication boundary

## Decision candidate

Promote exactly one bounded governance slice:
`IDA-CI03-SHARED-AUTH-CANONICAL-REMOTE-COVERAGE`.

The canonical GitHub-hosted `coverage:gate` must execute and aggregate the
provider-agnostic `@interdomestik/shared-auth` boundary. A missing, malformed,
non-numeric, or stale summary must fail closed. Existing web and `domain-*`
coverage, the repository 60% aggregate floor, and every independent security,
E2E, finalizer, Sonar, CodeQL, and main-health gate remain unchanged.

This is one outcome with one repository-owned cause and one rollback. It is not
product behavior, does not count as an R2 observation, does not reopen
CI01/CI02/B10, and makes no product-cycle ROI claim.

The previously considered `ci:local:full` on-demand routing change is explicitly
deferred. It has disjoint writers, evidence, and rollback and therefore requires
its own later authority gate after this coverage precondition is merged and
green on exact head. This gate neither authorizes nor changes global runner
files or local parity selection.

## Verified starting checkpoint

- AI OS observation
  `b7e2fa4b438ace5f20c0e50aff2ae8b8ea25efc4071eab0b40695c84b11070a2`
  exited `0`: Brain `current`, Integrity `clear`, M1 current, M2/M3 terminal,
  M4-M6 no qualified candidate, and M7 no authorized enrollment.
- Repository `main == origin/main ==`
  `0ac4a720e08d627b25454053173d0e99944055c7`, ahead/behind `0/0`, clean,
  one root worktree, no `codex/*` branch, and no active writer.
- `preflight.mjs` passed with hygiene report
  `1f8655ae654feb0ac81c666ac603b058eeb96adeab18aecd3be9d79c2cdd56e4`.
- Resolver is correctly `blocked_requires_current_authority`,
  `activeSlice=null`; the scorecard is nonzero only because no slice is
  promoted and otherwise reports new-slice readiness.
- Repo MCP is declared but not exposed as callable in this task runtime;
  read-only shell inspection is the recorded fallback.

## Exact gap and baseline

Canonical remote CI runs `pnpm coverage:gate`. At product main
`303b9883b7c47de71f25f398d1a66407852c8d3d`, GitHub CI run `31867275959`
passed; unit job `94970285081` ran `2026-08-15T05:34:51Z` to
`2026-08-15T05:47:44Z` (12m53s). Its aggregate listed `apps/web` and discovered
`packages/domain-*`, reporting 85.56% lines (`21191/24767`), but emitted no
`packages/shared-auth` row.

The omission is source-proven:

- root `test:coverage` executes web and `@interdomestik/domain-*`, not
  `@interdomestik/shared-auth`;
- `scripts/ci/coverage-gate.mjs` discovers only web and directories beginning
  `domain-`;
- `packages/shared-auth` has its own Vitest configuration and four focused
  collectors: permissions, governance, access-grants, and scope; and
- `scripts/ci/clean-coverage-artifacts.mjs` cleans web and `domain-*` coverage
  directories but not `packages/shared-auth/coverage`, allowing an old local
  summary to survive unless the cleaner is extended.

`test:unit:domains` does run shared-auth tests during `slice:verify`, but that is
not canonical remote line coverage or aggregation. A fresh GitHub checkout
avoids stale local output, while standalone/local aggregation still needs
deterministic cleaning before collection.

## One outcome

Canonical remote coverage must execute shared-auth tests exactly once, require
the resulting `coverage-summary.json`, emit a labeled
`packages/shared-auth` row, and include its covered/total lines in the existing
repository aggregate. The collector must remove old shared-auth coverage before
the run so a stale summary cannot satisfy the required-input contract.

No local-parity routing, workflow topology, threshold, Sonar ingestion, package
source, or product behavior changes.

## Frozen writer maps

### Authority-publication writers

- `docs/plans/2026-08-15-ida-dg41-ci03-shared-auth-canonical-remote-coverage.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

These docs-only writers grant no runtime.

### Repository runtime writers

- `package.json`
- `scripts/ci/coverage-gate.mjs`
- `scripts/ci/coverage-contracts.test.mjs`
- `scripts/ci/clean-coverage-artifacts.mjs`
- `scripts/repo-size-budget.json` only when deterministic tracked size changes
  require it

Maximum runtime writers: five including conditional size metadata.

No global skill, GitHub workflow, Docker/compose, local parity executor,
shared-auth source/test/config, product package, AI OS adapter, or second file
may be added. Discovery that another writer is necessary stops and re-gates.

## Canonical coverage contract

1. `test:coverage` keeps existing web and `domain-*` commands and adds exactly
   one explicit shared-auth coverage command with text, json, html, lcov, and
   json-summary reporters.
2. The cleaner removes and recreates `packages/shared-auth/coverage` with the
   existing ignored coverage roots before collection. A stale prior summary
   cannot survive the canonical command.
3. The aggregator treats web and shared-auth summaries as required. Absence,
   malformed totals, or non-numeric covered/total lines fails closed; it cannot
   silently omit shared-auth.
4. Dynamic `domain-*` discovery is unchanged. Database, UI, shared-utils,
   shared-logging, and other package coverage are not added.
5. The 60% aggregate floor is unchanged. No per-package threshold, exclusion,
   test deletion, skip, or quarantine is introduced.
6. `sonar.javascript.lcov.reportPaths` remains unchanged and does not ingest
   shared-auth lcov in this slice. Shared-auth source already remains within
   Sonar analysis, but no Sonar coverage-on-new-code movement is claimed.
7. GitHub-hosted CI is the canonical remote authority. Local coverage is
   focused development evidence only.

## Contract graph and closure

- Entry: root `test:coverage`, invoked by canonical remote CI unit coverage.
- Primitive: deterministic coverage cleanup, required-summary discovery, and
  aggregate calculation.
- Boundary: unchanged `packages/shared-auth` sources and four test collectors.
- Consumer: canonical CI aggregate; Sonar scanner inputs remain unchanged.
- State: one new required/labeled shared-auth coverage summary.
- Rollback: one content-addressed repository implementation revert.

Callers, test collectors, read/write/delete behavior, error paths, capabilities,
and baseline ownership are closed. Coverage writes only ignored report output;
the aggregator reads summaries and emits a verdict. Missing, stale, malformed,
or below-floor evidence fails closed. No product, database, AI OS, provider,
deployment, or production state is read or written.

## TDD and acceptance matrix

| ID | Required evidence | Command/environment | Invalidated by |
| --- | --- | --- | --- |
| A1 required aggregation | RED contract proves explicit shared-auth collection, required labeled summary, aggregate math, missing/malformed failure, and unchanged floor | `node --test scripts/ci/coverage-contracts.test.mjs` | package script, aggregator, coverage contract, shared-auth config/tests |
| A2 stale-summary hygiene | RED contract proves cleaner owns `packages/shared-auth/coverage`; focused execution cannot reuse an old summary | focused coverage-contract test and cleaner in disposable ignored output | cleaner, coverage root, command order |
| A3 exact-head regression | shared-auth row appears once in exact-head GitHub CI unit log; mandatory CI/security/E2E/reviewer/Sonar/CodeQL/finalizer evidence is classified | GitHub-hosted exact PR head plus one full exact-head PR E2E | runtime writer, PR head, remote environment, feedback |
| A4 rollback identity | pre-change tree and exact implementation revert identity are content-addressed and focused proof returns to baseline | SHA-256 manifest plus disposable revert verification | baseline hash, writer map, revert target |

Skipped A1-A4 evidence is failure.

TDD order:

1. Add RED contract assertions for the missing required shared-auth summary,
   explicit package command, label, aggregate math, and stale-cleaner root.
2. Apply the smallest production changes in the frozen four non-conditional
   writers.
3. Run focused contracts and the real shared-auth coverage command.
4. Run only repository-required current-head gates and remote CI; rerun only
   evidence invalidated by a changed head, environment, or finding.

## Highest-risk cases

- shared-auth tests run but remain absent from the canonical aggregate;
- a missing or malformed summary is ignored;
- a stale local shared-auth summary survives cleanup and passes aggregation;
- shared-auth is added twice or dynamic domain discovery changes;
- the 60% floor or unrelated package coverage scope drifts;
- Sonar ingestion is changed or overstated;
- independent security, RLS, Pilot, Sonar, CodeQL, finalizer, or E2E evidence is
  removed as duplicate; or
- implementation expands into local-full routing, workflow, product, AI OS,
  Docker, runner, or provider behavior.

## Focused and mandatory gates

Before PR:

- `node --test scripts/ci/coverage-contracts.test.mjs`
- explicit `@interdomestik/shared-auth` coverage collection and aggregate probe
- `pnpm test:ci:contracts`
- `pnpm repo:size:check`
- `git diff --check`
- one bounded senior review of the complete current diff

Final repository contracts remain:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- GitHub gitleaks, pnpm-audit, CodeQL, Sonar, finalizer, reviewer/Copilot
  feedback, and exact-main health

One full exact-head PR E2E is required and must not be repeated on an unchanged
head. Mac is control plane/light writer; no Mac Docker. GitHub-hosted Ubuntu is
the canonical coverage environment. Z620 is not required by this slice.

## Review disposition

Priority Claude Opus 5 reviewed the original 18,756-byte two-part candidate in
310.227 seconds and returned `REVISE`: three P1, two P2, and two P3 findings.
The central P1 proved shared-auth coverage and local-full routing were separable
because they had disjoint writers, proof surfaces, and rollback. One
consolidated remediation narrowed DG41 to coverage only, restored one-cause
rollback, added the cleaner stale-summary contract, preserved `behavior-eval`
and all global skill files as read-only/out of scope, documented unchanged
Sonar ingestion, and aligned A1-A4.

The same senior route must re-review this complete current gate and admission.
Only its current-artifact terminal verdict is valid. Repository tests, CI,
security, Sonar, CodeQL, finalizer, and main health remain authoritative.

## Runtime sequence and approval separation

1. Exact approval of this immutable gate authorizes only a docs-only authority
   PR and merge; runtime remains false.
2. After merge, run one governed AI OS publication/check, preflight, resolver,
   scorecard, and exact writer/consumer inventory on then-current main.
3. Prepare a separate content-addressed runtime receipt bound to exact main,
   gate, task/worktree/branch, commands, writer map, and rollback.
4. Only exact runtime approval may authorize one fresh worktree, one writer,
   product-repo mutation, focused TDD, PR, merge, and closeout.
5. Closeout records exact remote unit timing before/after and any measured
   coverage delta. It makes no product-cycle ROI claim.

No Brain product session or M7 enrollment is created for this governance/CI
slice. AI OS remains advisory and changes only through the task-owned governed
publication/check after stable repository evidence.

## Rollback and stop conditions

Repository rollback is the single implementation merge revert, followed by
focused coverage contracts and exact-main health. Stop and re-gate if:

- any writer outside the maximum five paths is required;
- canonical remote coverage cannot require and aggregate shared-auth without
  changing the 60% floor or unrelated package scope;
- a stale summary cannot be excluded by the approved cleaner path;
- an independent gate would be removed, skipped, weakened, or reclassified;
- exact approval/runtime separation, one writer, rollback, current-head proof,
  or exact-main health cannot be proved; or
- local-full routing, global skill, product, workflow, deployment, production,
  provider, Brain/M1-M7 runtime, or a second slice appears.

## Explicit exclusions

- `ci:local:full` routing, gate-plan, global skill, workflow-scorecard, behavior
  evaluation, local parity implementation, cache, cleanup, Docker, and runners;
- product UI/domain, routes/proxy, auth/session implementation, tenancy,
  membership, persistence, schema/RLS, billing, analytics, dashboard, Hero,
  copy/i18n, and browser behavior;
- shared-auth source, exports, tests, Vitest config, thresholds, exclusions, or
  per-package policy;
- GitHub workflow YAML, branch protection, Pilot Gate, Sonar configuration,
  CodeQL, finalizer, release/CD, deployment, production, provider, Vercel, and
  Z620 allocation;
- CI01/R2 policy, CI02 parser semantics, MK consolidation, dependency PRs,
  product-cycle ROI, AI OS adapter/config/controller/runtime/freeze,
  Brain/M1-M7, Atlas, retention, retrieval, cohort work, and every second slice.
