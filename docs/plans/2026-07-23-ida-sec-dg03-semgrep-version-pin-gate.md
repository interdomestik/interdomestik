---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG03
slice: IDA-SEC03
revision: R0
date: 2026-07-23
authority: root-orchestrator
---

# IDA-SEC-DG03 — Semgrep Verified-Version Pin

## Decision

Promote exactly one security/CI prerequisite slice: `IDA-SEC03`.

`IDA-SEC03` replaces the floating Semgrep installation in the deterministic PR
backstops workflow with the exact already-proven version `1.171.0` and adds a
focused contract that prevents the dependency from becoming floating again.

This docs-only gate authorizes no implementation. Repository implementation may
begin only after this gate is canonical and a separate exact runtime-authority
receipt binds the then-current `main`.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `19fd318cf72de44313de68842af9552d2a81f1de`
- Base tree: `c0ba91c18844cd123179044c933bd50834076e93`
- Workflow blob:
  `5dda794c823fa5997a2cad774389d3c7e9e94f66`
- Branch before gate: `main`
- Upstream: `origin/main`
- Resolver before gate: `blocked_requires_current_authority`
- Resolver reason: `umbrella_without_concrete_promoted_slice`
- Active slice before gate: `null`
- AI OS observation:
  `12a47a9c37e103726dd322e7462b25ce10e6183321155e7766827c1706306c6a`
- AI OS runtime state before gate: `not_authorized`
- Active execution:
  `interdomestik-ida-sec-dg03-semgrep-pin-gate`
- Active-execution authority: `advisory_only`

Brain current-source retrieval was attempted once with the active-execution
requirement and failed closed because its source snapshot is stale. It is not
retried against the unchanged snapshot, supplies no authority and supports no
usefulness or ROI claim.

## Trigger Evidence

1. Sonar Main run `30037491428`, check run `89310074309`, is non-pass because
   new-code Security Rating is C instead of the required A.
2. The remaining issue is
   `AZ-ACoVO5G2i53uX0BTV`, rule `githubactions:S8544`, at
   `.github/workflows/pr-deterministic-backstops.yml:88`.
3. The rule requires Python dependencies to be locked to verified versions.
   The current command is:

   ```text
   python -m pip install --upgrade semgrep
   ```

   It selects a mutable latest release and therefore does not provide a
   reproducible scanner dependency.

4. The workflow blob is unchanged across the completed IDA slices that
   repeatedly classified this issue as historical. Commit blame identifies
   `29397f184b` as the introduction point; the issue is not attributable to
   `IDA-CD01`, `IDA-SEC02` or their closeouts.
5. Exact successful PR Deterministic Backstops run `30037180334` installed
   `semgrep-1.171.0` and completed green. Its log records both the downloaded
   `1.171.0` wheel and the successful installed-version receipt.
6. PyPI project metadata observed on 2026-07-23 reports `1.171.0`, uploaded
   2026-07-22, with `Requires-Python >=3.10`. That is compatible with the
   workflow's current `actions/setup-python@v6` and `python-version: '3.x'`
   execution that produced the green run.
7. GitHub Codex reviewed the final IDA-SEC02 closeout head and reported no major
   issue. Its earlier PR `#1419` findings concerned a tracker digest and exact
   size budget; both were remediated before merge. No Codex comment supplies
   runtime authority for this new slice.

## Exact Implementation Contract

The future implementation must make exactly this semantic change:

```text
python -m pip install semgrep==1.171.0
```

The implementation must:

1. remove the floating `--upgrade semgrep` install;
2. pin the direct Semgrep dependency with exact `==1.171.0` syntax;
3. preserve the existing Python setup step and all workflow job conditions,
   permissions and draft-policy behavior;
4. preserve the existing Semgrep scan command, including:
   - `--config p/ci`;
   - exact PR base SHA as `--baseline-commit`;
   - `--metrics=off`;
   - `--error`;
   - SARIF output;
5. preserve the conditional SARIF upload and its trusted action reference;
6. add no package manifest, lockfile, requirements file or dependency;
7. add no network/provider/deployment/runtime behavior outside the existing
   GitHub-hosted workflow execution after merge.

Transitive Python dependency hash locking and Python runtime pinning are not
selected by this slice. If Sonar or focused proof shows that the exact direct
pin does not close `githubactions:S8544`, the child stops and returns to current
authority rather than expanding scope.

## RED → GREEN Proof

The sole writer must modify the focused deterministic-backstops contract test
before editing the workflow.

RED must prove the current workflow fails because:

- the Install Semgrep step is not exactly
  `python -m pip install semgrep==1.171.0`; and
- the command still contains a floating/unversioned Semgrep install.

GREEN must prove:

- the Install Semgrep step is exactly the accepted command;
- neither `--upgrade semgrep` nor an unversioned direct install remains;
- the existing baseline/config/metrics/error/SARIF assertions remain green;
- workflow parsing and all existing deterministic-backstop contracts remain
  green;
- `git diff --check` and repository-size proof pass.

The PR's current-head Sonar result must report no open new issue for
`githubactions:S8544`. A local string assertion cannot substitute for that
Sonar disposition.

## Future Writer Map

The future `IDA-SEC03` writer map is exactly three paths:

1. `.github/workflows/pr-deterministic-backstops.yml`
2. `scripts/ci/pr-deterministic-backstops-contracts.test.mjs`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fourth path stops the slice and returns to current authority. In particular,
the future child must not edit:

- any other workflow or composite action;
- package manifests, `pnpm-lock.yaml` or Python requirements files;
- Sonar configuration or quality-gate policy;
- proxy, routes, auth, tenancy, schema, RLS, migrations or product UI;
- README, AGENTS, architecture docs, Brain/AI OS tooling;
- frozen `IDA-UI03a2` state or preserved security/Z620 worktrees.

## Execution and Review

`IDA-SEC03` is prospective Tier 3 because it changes shared CI/security
infrastructure. After canonical gate merge and a separate exact runtime receipt:

- root creates exactly one fresh worktree-backed child as sole writer;
- no competing or overlapping writer may exist;
- the child owns test-first implementation, focused/full proof, commit, push and
  ready-PR handback only;
- root retains scope, advisory lifecycle, milestone monitoring, reviews,
  current-head evidence, merge, exact CD containment, main health, cleanup and
  child archival;
- the child model is `gpt-5.6-sol` with `xhigh` reasoning: the patch is narrow,
  but it changes a supply-chain security gate shared by every PR;
- idle/system-error recovery reuses the same durable worktree once and never
  creates a competitor.

Required implementation proof:

1. exact three-path base-to-head diff and `git diff --check`;
2. focused
   `node --test scripts/ci/pr-deterministic-backstops-contracts.test.mjs`;
3. `pnpm test:ci:contracts`;
4. `pnpm repo:size:check`;
5. `pnpm security:guard`;
6. `pnpm pr:verify`;
7. `pnpm e2e:gate`;
8. current-head Sonar, CodeQL, secret scan, audit, deterministic backstops,
   finalizer and every required repository check;
9. GitHub Codex and Copilot current-head feedback disposition;
10. zero unresolved actionable review threads before merge.

No external model reviewer is invoked by this gate without explicit user
approval. GitHub current-head review, repository checks and root classification
remain required and do not replace one another.

## Merge and Containment

Root may merge only the exact approved current head after all required checks
and feedback are green or evidence-classified.

Immediately after merge, root must identify and cancel only the exact automatic
CD run before checkout, registry login, image build, provider contact or deploy.
Cancellation is containment, not deployment authority. If a forbidden step
executes before cancellation takes effect, root records an incident-authority
stop and seeks explicit disposition before closeout.

Root then proves exact new `origin/main` head/tree, main CI/Sonar/CodeQL/secret
scan/audit health, resolver and AI OS state, clean canonical/task-owned
worktrees, consumed runtime authority and archived child.

## Explicit Non-Authority

This gate keeps:

```yaml
runtime_authorized: false
workflow_dispatch_authorized: false
provider_contact_authorized: false
alias_mutation_authorized: false
environment_mutation_authorized: false
deployment_authorized: false
production_authorized: false
database_authorized: false
z620_runner_or_cd_authorized: false
```

Z620 remains the sole primary local Docker/Supabase/PostgreSQL host but is
local-only and untouched by this slice. Mac mini Docker/Supabase remains
retired except for a separately authorized, time-bounded incident fallback.

Frozen `IDA-UI03a2`, UI/product, runtime AI, Eval v2 and every other successor
remain blocked or unpromoted.

## Stop Conditions

Stop and return to current authority on:

- any fourth implementation path;
- any requested Sonar-policy waiver or issue suppression;
- any need to change Python runtime, transitive locking, package manifests or
  additional scanner configuration;
- any protected-surface, provider, database, deployment or production need;
- base drift before runtime authority;
- failed exact-version compatibility proof;
- unresolved current-head Sonar, Codex, Copilot, CodeQL or security finding.
