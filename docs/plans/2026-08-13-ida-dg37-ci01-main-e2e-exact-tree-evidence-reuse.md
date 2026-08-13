# IDA-DG37-CI01 Main E2E Exact-Tree Evidence Reuse

Status: current authority; R1 consumed; R2 blocked pending exact-approved association amendment

Date: 2026-08-13

Authority base: `6ca7ce02ae430c3a78cde5449b2c625d5cd58917`

Authority tree: `75401bf05a0f229e6fa573e233571a1b66a34bf6`

Association-amendment base:
`d7274986b18e7dcb55fc062f43dc69c2909d0c71` / tree
`342c33ea41cb164fdd9feadf74ad86e8102cc1bc`

Tier: 3 — CI and merge-gate infrastructure

## Decision

Promote exactly one bounded infrastructure slice:
`IDA-CI01-MAIN-E2E-EXACT-TREE-EVIDENCE-REUSE`.

The slice must stop running the same browser-gate projects a second time after
merge only when GitHub proves that a successful, concrete PR E2E runner tested
the exact Git tree now present on `main`. Every gate remains present. When any
identity, freshness, API, workflow, job, repository, or substrate check is
missing or invalid, the existing main E2E gate must run.

This decision does not authorize product work, broad CI cleanup, deletion of
tests, relaxed branch protection, or a second optimization.

## Problem and measured baseline

The accepted Value Mode closeout identified repeated PR-to-main browser work as
a material wait surface. A representative same-tree pair provides the bounded
baseline:

- PR `#1545` reviewed head `364f186752fb3f9961672a959d0e746d25705395`
- main merge `6ca7ce02ae430c3a78cde5449b2c625d5cd58917`
- both resolve to tree `75401bf05a0f229e6fa573e233571a1b66a34bf6`
- PR E2E: `20m31s`
- repeated main `E2E Gate Suite`: `16m15s`
- whole main `e2e-gate` job: `19m02s`
- observed main critical-path delay relative to the parallel unit lane: about
  `6m13s`

The `16m15s` suite duration is the compute/wait target, not a guaranteed
end-to-end delivery saving. Only post-merge measurements may establish actual
critical-path savings.

## Mandatory prerequisite

Inspection found that the historical main browser suite defaulted to
`127.0.0.1:54322/postgres`, while the CI job prepared its declared Postgres 16
service at `127.0.0.1:5432/interdomestik_test`. Evidence reuse must not hide an
unproved correction to that substrate.

Before reuse is enabled, one prerequisite PR must:

1. bind the existing main `E2E Gate Suite` to the workflow-level
   `DATABASE_URL` for both `E2E_DATABASE_URL` and `E2E_DATABASE_URL_RLS`;
2. add one focused contract test for service database, port, prepare-step, and
   suite binding;
3. preserve every other step and condition;
4. merge without reuse logic; and
5. produce one successful concrete main `E2E Gate Suite` on the corrected
   substrate.

Draft PR `#1546` and commit `e542df612760578ee985e37552e1883b4b1931da`
were created before the mandatory current-authority promotion was noticed.
They are non-authoritative prototype evidence only, must remain unmerged, and
must not be reused as the post-authority implementation head. After authority
and runtime approval, the prerequisite must be recreated from then-current
clean main and reviewed again.

The approved prerequisite was recreated as PR `#1548`, reviewed at head
`b760d2253a1973294613770d09260bea45ddad95`, and squash-merged as
`d7274986b18e7dcb55fc062f43dc69c2909d0c71`. Main CI run `31715521046`
passed on the corrected substrate without rerun. Its `E2E Gate Suite` took
`13m29s`; the whole `e2e-gate` job took `15m41s`.

The successful PR E2E run `31712197425` is event `pull_request`, workflow
`.github/workflows/e2e-pr.yml`, head
`b760d2253a1973294613770d09260bea45ddad95`, and concrete runner success, but
GitHub's run payload returns an empty `pull_requests` array. The bounded
`commits/{head_sha}/pulls` endpoint returns exactly PR `#1548` with the same
number/id, head repository/ref/SHA, base repository/`main`, merge SHA, and
merged timestamp. The association amendment below permits that second official
edge only when the run association array is exactly empty; it does not weaken
any tree, repository, workflow, job, freshness, or substrate predicate.

## Frozen authority and implementation scope

### Docs-only authority writers

- `docs/plans/2026-08-13-ida-dg37-ci01-main-e2e-exact-tree-evidence-reuse.md`
- `docs/plans/current-program.md`
- `docs/plans/current-tracker.md`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

The authority PR must append one current-program revision and one matching
tracker revision that promote only CI01, record this gate's exact byte count and
SHA-256 after review and approval, freeze the two-stage runtime boundary below,
and leave `runtime_authorized:false`. Those canonical append-only revisions,
not this standalone file, make CI01 current authority.

### Prerequisite writers

- `.github/workflows/ci.yml`
- `scripts/ci/main-e2e-db-parity.test.mjs`
- `scripts/ci/z620-parity.json`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

### Evidence-reuse writers

- `.github/workflows/ci.yml`
- `scripts/ci/github-api-url-lib.mjs`
- `scripts/ci/github-api-url-lib.test.mjs`
- `scripts/ci/main-e2e-reuse.mjs`
- `scripts/ci/main-e2e-reuse-core.mjs`
- `scripts/ci/main-e2e-reuse-core.test.mjs`
- `scripts/ci/main-e2e-reuse-fixture.mjs`
- `scripts/ci/main-e2e-reuse-github.mjs`
- `scripts/ci/main-e2e-reuse-github.test.mjs`
- `scripts/ci/main-e2e-reuse-cli.test.mjs`
- `scripts/ci/main-e2e-reuse-workflow.test.mjs`
- `scripts/ci/workflow-contracts.test.mjs` only for non-duplicated contract
  placement
- `scripts/ci/z620-parity.json`
- `scripts/repo-size-budget.json` only when deterministic committed-tree size
  accounting requires it

No other writer path is authorized. Existing user-owned or skip-worktree files
must not be changed or incorporated into size metadata.

## Exact acceptance contract

Main browser-suite reuse is allowed only when all conditions below hold:

1. event is `push`, ref is exactly `refs/heads/main`, repository is exactly
   `interdomestik/interdomestik`, and the local checked-out `HEAD` equals
   `GITHUB_SHA`;
2. exactly one merged same-repository pull request has
   `merge_commit_sha == GITHUB_SHA`, `base.repo.full_name == GITHUB_REPOSITORY`,
   and `base.ref == main`;
3. the PR head commit tree equals local `HEAD^{tree}`;
4. a completed successful run exists for workflow path
   `.github/workflows/e2e-pr.yml`, event `pull_request`, the exact PR head SHA,
   and the same repository and head repository. Association to the selected
   merged PR must be proved by exactly one of these closed branches:
   - when the run's `pull_requests` array is non-empty, it must contain exactly
     one entry and that entry must equal the selected PR number/id, base
     repository/`main`, and head repository/ref/SHA; or
   - only when the run's `pull_requests` array is exactly empty, a bounded
     `commits/{run.head_sha}/pulls` query must return exactly one PR, and it must
     equal the selected PR number/id, merged state/timestamp and merge SHA, base
     repository/`main`, and head repository/ref/SHA. A missing, malformed,
     truncated, ambiguous, or mismatched response is not association evidence.
     A non-empty direct association that mismatches the selected PR may never be
     replaced or repaired by the commit-to-PR fallback;
5. the concrete job named `PR E2E Runner` exists exactly once and completed
   successfully;
6. the run started within the frozen 24-hour freshness window, with at most a
   five-minute future clock tolerance;
7. the PR workflow explicitly checks out
   `${{ github.event.pull_request.head.sha }}`;
8. the PR project list is a strict superset of the main gate project list and
   shared flags and database substrate are identical; and
9. the resolver completes all run, job, PR, commit-tree, and conditional
   commit-to-PR requests within bounded GitHub API pagination and request
   timeouts without exposing tokens, response bodies, or unbounded error text.

The resolver must write only one normalized decision. `reuse=true` is valid
only with reason `exact_pr_evidence`. Every exception, timeout, malformed
payload, missing output, direct push, fork, ambiguity, stale run, mismatched
tree, wrong workflow, wrong head, wrong repository, skipped job, or failed job
must resolve to reuse false or leave no true output. The workflow condition
must treat anything other than the exact string `true` as a command to run the
main E2E suite.

## Gates that remain mandatory

Reuse may skip only `pnpm e2e:gate` inside the existing main `e2e-gate` job.
It must not skip or weaken:

- workflow checkout and setup required by remaining steps;
- ephemeral credential generation;
- strict E2E best-practice guards;
- database migration, seed, and seed assertion;
- RLS integration and coverage checks;
- CI audit, static, unit, AI eval, security, CodeQL, Semgrep, OSV, gitleaks,
  Sonar, finalizer, or branch protection; or
- the full PR E2E runner.

The resolver itself is advisory evidence selection. It must use read-only
GitHub token permissions and `continue-on-error`; failure never fails open.

## TDD and review sequence

1. Establish RED tests for prerequisite DB parity before editing the workflow.
2. Land and merge the prerequisite from current main.
3. Verify a real main browser suite passed on the corrected DB substrate.
4. Establish RED tests for resolver absence and every security-critical
   negative predicate, including wrong workflow path, fork head repository,
   wrong head SHA, wrong base repository/ref, same-head association with a
   different PR, empty-array fallback success, fallback ambiguity, fallback
   head/ref/repository/merge mismatch, forbidden fallback after a non-empty
   direct mismatch, stale start time, missing concrete runner, hostile reason,
   and checkout-ref drift.
5. Implement the smallest dependency-free resolver and workflow wiring.
6. Run focused contracts, the full CI contract suite, repository-native
   security and modularity guards, format/diff checks, and exact metadata
   checks.
7. Obtain one bounded Opus 5 implementation review, at most one consolidated
   remediation, and one substantive same-route re-review. If Opus 5 is blocked
   by a recorded quota/tooling receipt, GPT-5.6-Sol Ultra is the only approved
   fallback and counts only after Arben explicitly approves that route; the
   blocked Opus attempt remains `unavailable`, never pass.
8. Explicitly request GitHub Copilot code review on the final ready PR using
   `copilot-pull-request-reviewer[bot]`. If GitHub does not deliver a retained
   review, record `unavailable`, not pass.
9. Run exactly one full exact-head PR E2E. Rerun only invalidated evidence.
10. Merge only after all repository-required checks and unresolved-thread
    checks pass.
11. On exact main, require the resolver to accept the merged same-tree PR,
    require `E2E Gate Suite` to be skipped, and require every non-reused gate to
    remain green.

## Measurement and stop rule

Record for the prerequisite and reuse PRs:

- PR E2E runner duration;
- main `e2e-gate` job and browser-suite duration;
- main CI completion time and its critical path relative to parallel jobs;
- resolver duration and outcome;
- reruns, retries, quarantines, and failures;
- review findings and remediation count; and
- actual implementation/review overhead spent to obtain the saving.

Compare post-reuse main against the same-tree baseline above and the
prerequisite proof run. Report suite compute avoided separately from observed
critical-path time saved. Do not claim ROI from a single run if queueing,
caching, or unrelated job variance prevents a fair comparison.

If the resolver does not safely reuse exact evidence, causes a gate bypass,
requires broader workflow architecture, or saves no material wait after three
representative merges, disable or revert reuse and retain only the proven DB
substrate correction.

## Explicit exclusions

- no product, route, proxy, auth, session, tenancy, schema/RLS-policy, billing,
  provider, deployment, or production behavior change;
- no deletion, quarantine, weakening, renaming, or consolidation of tests or
  required checks;
- no broad CI/E2E/preflight deduplication;
- no AI OS, Brain, retrieval, graph, persona, dashboard, agent-count, or
  workflow-system expansion;
- no automatic merge; and
- no second product or infrastructure slice.

## Authority and runtime boundary

This document and the matching append-only current-program/current-tracker
revisions may be reviewed and exact-hash approved as one docs-only design gate.
Their merge promotes only `IDA-CI01-MAIN-E2E-EXACT-TREE-EVIDENCE-REUSE` with
`runtime_authorized:false`.

After the docs-only authority merge, the runner must re-read current main and
re-run repository preflight/resolver checks. The execution then has two
separately approved stages:

1. `CI01-RUNTIME-R1` binds then-current main, this exact gate hash, and only the
   prerequisite writer map. The runner must stop for Arben's exact approval of
   R1 before recreating the prerequisite from clean main or mutating code.
2. After the prerequisite merges and one corrected-substrate main browser suite
   passes, `CI01-RUNTIME-R2` binds that new exact main, the prerequisite merge
   and proof run, the exact-approved association-amended gate hash, and only the
   evidence-reuse writer map. The runner must stop again for Arben's exact
   approval of R2 before creating the reuse implementation branch or mutating
   reuse code.

R1 cannot authorize reuse and R2 cannot be precomputed before prerequisite
main proof. A failed prerequisite consumes neither R2 nor permission to proceed.

Terminal closeout consumes the promotion, records prerequisite and reuse merge
identities plus measured before/after evidence, restores
`blocked_requires_current_authority` with `activeSlice=null`, and promotes no
successor.
