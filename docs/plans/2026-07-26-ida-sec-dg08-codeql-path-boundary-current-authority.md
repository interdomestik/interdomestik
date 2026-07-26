---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG08
slice: IDA-SEC08a
revision: R1
date: 2026-07-26
authority: arben-and-root-orchestrator
---

# IDA-SEC-DG08 — CodeQL CI Path-Boundary Remediation

## Decision

Promote exactly one security implementation slice: `IDA-SEC08a`.

`IDA-SEC08a` establishes the source-level path-boundary foundation for CodeQL
alerts `#181`, `#182` and `#183` by making the runner-owned file boundary
explicit for every CI gate CLI that consumes the shared GitHub event,
changed-file or output paths. The implementation must normalize each candidate
path, resolve symlinks, prove containment under the canonical `RUNNER_TEMP`
root, reject non-regular files and fail closed before reading or appending.

The complete operational remediation is a mandatory two-slice chain. After
`IDA-SEC08a` merges, a fresh current-authority gate must promote
`IDA-SEC08b` to update the five pinned workflow callers to the exact canonical
merge SHA containing the new source boundary. `IDA-SEC08b` is not promoted by
this gate and cannot begin until `IDA-SEC08a` is terminal. This split avoids an
impossible self-reference to the final commit and avoids pinning mandatory
gates to a transient intermediate commit that may not remain reachable after a
squash merge.

This docs-only gate authorizes no implementation. Repository implementation may
begin only after this gate is canonical and a separate exact runtime-authority
receipt binds the then-current `main`.

## Classification

- Gate class: current-authority/design-gate promotion.
- Gate risk: Tier 0 because it changes only canonical plan/tracker evidence and
  deterministic repository-size metadata.
- Prospective implementation class: CI security hardening.
- Prospective implementation risk: Tier 3 because the selected scripts decide
  PR gate policy and write GitHub Actions outputs.
- Product behavior: unchanged.
- Routing, auth, tenancy, schema, RLS, billing, provider and deployment impact:
  none.
- Pre-push profile: `FAST` after focused local proof. The change has no product
  runtime, database, build, browser or dependency-graph behavior. GitHub
  current-head CI, E2E, Pilot, Sonar, CodeQL, security and finalizer remain
  merge authority.

The implementation escalates and stops if repository evidence requires a
workflow YAML change inside `IDA-SEC08a`, another path-consuming gate CLI,
product runtime, database, provider, deployment or protected-surface change.
Workflow pin activation belongs only to the mandatory successor
`IDA-SEC08b`.

## Authority Base

- Repository:
  `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base and `origin/main`:
  `7ce597ae2e47bfd6223ea2cce534e2477ae0c41c`
- Base tree:
  `6886418d657810ee5c293f90293b259c629c6479`
- Gate branch:
  `codex/ida-sec-dg08-codeql-path-boundary`
- Upstream before branch creation: `origin/main`
- Ahead/behind before branch creation: `0/0`
- Resolver before gate: `blocked_requires_current_authority`
- Resolver reason: `umbrella_without_concrete_promoted_slice`
- Active slice before gate: `null`
- AI OS observation:
  `343676bb9a5c7385142f5efff7613593220339139ef71edbf24a1e434abf2884`
- AI OS authority state before gate: `current`
- AI OS runtime state before gate: `not_authorized`
- Active-execution authority: `advisory_only`

The Obsidian/Wiki dashboard was used only for orientation. AI OS supplied
current-state, integrity and approval-hold context. Repository source, tests,
current program/tracker, GitHub alert evidence and CodeQL's documented
containment guidance are authority for this decision. Brain retrieval was
stale and failed closed after detecting current-program/tracker changes; no
Brain index, retrieval, ranking, MCP, hook or memory truth was changed.

## Trigger Evidence

1. GitHub CodeQL alerts `#181`, `#182` and `#183` are open on `main`.
2. All three alerts use rule `js/path-injection`, severity `high`, with security
   severity `7.5`.
3. Alert `#181` points to `scripts/ci/github-pr-files.mjs:67`, where
   `GITHUB_OUTPUT` reaches `appendFileSync`.
4. Alerts `#182` and `#183` point to
   `scripts/ci/pr-gate-policy.mjs:13-14`, where command-line file paths reach
   `existsSync` and `readFileSync`.
5. The composite action already creates the changed-files artifact under
   `${RUNNER_TEMP}`. GitHub's event file and output command file are also
   runner-owned temporary artifacts.
6. Existing tests prove ordinary PR policy, incomplete evidence, rename
   accounting, PR-file pagination and non-PR behavior, but do not prove
   traversal, symlink or out-of-root rejection.
7. The composite action passes the same event and changed-file paths to
   `validation-surface-policy.mjs` and `ai-eval-surface.mjs`.
   `validation-surface-policy.mjs` reads through
   `policy-cli-common-lib.mjs`, while `ai-eval-surface.mjs` reads directly.
   Those consumers therefore need the same shared boundary even though the
   current three CodeQL alerts point only to the other two CLIs.
8. `multi-agent-policy.mjs` also consumes the shared policy reader, so its CLI
   fixtures must provide the same trusted root. The local Z620 validation lane
   currently creates its changed-file artifact under an isolated temporary
   directory but does not pass that directory as `RUNNER_TEMP`; it must make
   that existing task-owned directory the explicit trusted-root handoff.
9. CodeQL's official remediation guidance for complex paths is to normalize
   with `path.resolve` or `fs.realpathSync`, then prove the result remains
   under a safe root. A prefix check must use a path-separator boundary, not a
   naive string prefix.
10. Rev 169 closed the dependency-maintenance bridge and explicitly left these
    three alerts unpromoted pending fresh current authority.
11. Live GitHub REST reports zero open Dependabot alerts and zero open
    secret-scanning alerts. These CodeQL findings are therefore the smallest
    concrete remaining security batch.

Frozen `IDA-UI03a2`, every product/UI slice and every architecture successor
remain separate and unpromoted. `IDA-SEC08a` and its mandatory pin-activation
successor must not absorb them.

## Security Contract

The implementation must provide one shared helper with these properties:

1. require a non-empty `RUNNER_TEMP` safe root;
2. canonicalize the root with `fs.realpathSync`;
3. normalize the candidate with `path.resolve`;
4. canonicalize the existing candidate or its existing parent directory;
5. prove the canonical candidate is either the root itself or starts with the
   canonical root plus `path.sep`;
6. reject symbolic links and non-regular existing files;
7. return only the canonical contained path to the caller;
8. preserve fail-closed behavior when evidence is absent or invalid;
9. never fall back to the current directory, repository root, filesystem root,
   `os.tmpdir()` or a caller-controlled parent as the trust root.

All four path-consuming gate CLIs must:

- `github-pr-files.mjs` must validate its event input and `GITHUB_OUTPUT`;
- `pr-gate-policy.mjs` must validate its event and changed-file inputs;
- `validation-surface-policy.mjs` must receive validated event and
  changed-file inputs through `policy-cli-common-lib.mjs`;
- `ai-eval-surface.mjs` must validate its changed-file input;
- preserve existing CLI outputs, pagination, rename accounting, changed-file
  completeness, validation-surface and AI-eval selection, and fail-full policy;
- emit no path contents, secrets or event payloads in failures.

No suppression, CodeQL dismissal, allowlist or inline query waiver is allowed.

## RED → GREEN Proof

RED on the exact authority base is:

- CodeQL alerts `#181`, `#182` and `#183` are open;
- four gate CLIs reach filesystem APIs from externally supplied paths without
  one canonical containment boundary;
- no shared `RUNNER_TEMP` containment helper exists;
- no focused negative test covers traversal, prefix-collision, symlink escape,
  missing safe root or non-regular-file rejection.

GREEN for `IDA-SEC08a` must prove:

- valid runner-owned event, changed-files and output files still work;
- traversal and absolute out-of-root candidates fail closed;
- sibling prefix collisions such as `<root>-outside` fail closed;
- symlink escapes fail closed;
- missing `RUNNER_TEMP` fails closed when a filesystem path is required;
- a missing optional changed-files artifact inside the trusted root continues
  to select the existing fail-full policy;
- existing PR-file and PR-policy behavior remains unchanged;
- CodeQL current-head analysis closes or supersedes alerts `#181`-`#183`
  without dismissal or suppression, while operational activation remains
  incomplete until `IDA-SEC08b` pins all mandatory callers to the canonical
  merged source.

## Future Writer Map

The future `IDA-SEC08a` writer map is exactly fourteen paths:

1. `scripts/ci/trusted-runner-file.mjs` — new shared containment helper
2. `scripts/ci/trusted-runner-file.test.mjs` — new negative/positive contracts
3. `scripts/ci/github-pr-files.mjs`
4. `scripts/ci/github-pr-files.test.mjs`
5. `scripts/ci/pr-gate-policy.mjs`
6. `scripts/ci/pr-gate-policy-cli.test.mjs`
7. `scripts/ci/policy-cli-common-lib.mjs`
8. `scripts/ci/validation-surface-policy.test.mjs`
9. `scripts/ci/ai-eval-surface.mjs`
10. `scripts/ci/ai-eval-surface.test.mjs`
11. `scripts/ci/z620-validation-surface.mjs`
12. `scripts/ci/multi-agent-policy.test.mjs`
13. `scripts/ci/validation-surface-package-cli.test.mjs`
14. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fifteenth path stops the slice and returns to current authority. In
particular, the future writer must not edit:

- `.github/actions/pr-gate-policy/action.yml` or any workflow;
- `scripts/ci/github-pr-files-lib.mjs` or policy evaluation semantics;
- application, package, database, migration, RLS or product test source;
- `apps/web/src/proxy.ts`, canonical routes, auth or tenancy;
- provider, alias, environment, deployment, production or release surfaces;
- README, AGENTS, architecture docs, Brain/AI OS tooling or product UI;
- preserved worktrees, stashes or Z620 evidence/state.

## Mandatory Activation Successor

After `IDA-SEC08a` is merged and exact-main health is proved, root must issue a
fresh hash-bound current-authority decision for `IDA-SEC08b`. That decision
must bind the exact canonical merge SHA containing the path-boundary helper and
must promote only the workflow pin activation.

The expected `IDA-SEC08b` writer map is exactly:

1. `.github/workflows/ci.yml`
2. `.github/workflows/e2e-pr.yml`
3. `.github/workflows/pilot-gate.yml`
4. `.github/workflows/pr-deterministic-backstops.yml`
5. `.github/workflows/pr-finalizer.yml`
6. `scripts/ci/pr-gate-pin-contracts.test.mjs`
7. `scripts/ci/workflow-contracts.test.mjs`
8. `scripts/ci/draft-gate-workflow-contracts.test.mjs`
9. `scripts/repo-size-budget.json` — deterministic synchronization only

The successor may replace only the existing
`interdomestik/interdomestik/.github/actions/pr-gate-policy@...` commit with
the exact canonical `IDA-SEC08a` merge SHA and update the three existing pin
contracts to require the same SHA. Any tenth path or any workflow-semantic
change stops. `IDA-SEC08b` must prove all five mandatory callers execute the
new canonical source before the overall `IDA-SEC08` remediation can be called
operationally complete.

## Required Implementation Proof

After canonical gate merge and separate exact runtime authority, the sole
`IDA-SEC08a` writer must run:

1. exact fourteen-path scope audit and `git diff --check`;
2. focused RED tests proving the vulnerable boundary;
3. focused GREEN:
   `node --test scripts/ci/trusted-runner-file.test.mjs
scripts/ci/github-pr-files.test.mjs
scripts/ci/pr-gate-policy-cli.test.mjs
scripts/ci/validation-surface-policy.test.mjs
scripts/ci/ai-eval-surface.test.mjs
scripts/ci/multi-agent-policy.test.mjs
scripts/ci/validation-surface-package-cli.test.mjs`;
4. `pnpm test:ci:contracts`;
5. `pnpm check:modularity-guard`;
6. `pnpm repo:size:check`;
7. `pnpm security:guard`;
8. `pnpm slice:verify`;
9. repository-mandatory `pnpm pr:verify` and `pnpm e2e:gate`;
10. one exact-SHA proportional FAST pre-push proof on Z620 when the canonical
    runner is available, using only task-owned evidence and no product DB;
11. current-head GitHub CI, E2E, Pilot, Sonar, CodeQL, secret scan,
    dependency/security and finalizer checks;
12. current-head Codex review and zero unresolved actionable review threads.

Because this is shared CI infrastructure, current-head Codex review is
mandatory. A blocked optional review route is recorded with exact evidence and
does not become approval. Copilot is unavailable until its quota renews and
must be recorded as NON-PASS, never as approval.

No local full release lane, provider call or deploy is selected. Mac Docker
remains off. If a mandatory repository gate needs Docker, database or browser
resources, it must use the canonical task-isolated Z620 runner with a
disposable task database, unique task port and task-owned evidence namespace.

## Multi-Tenant, Privacy and Operations Assessment

- Data ownership and tenancy: no product data is read or written.
- Authorization: no product auth decision changes.
- Routing/proxy: untouched.
- Billing/entitlements: untouched.
- Retention/deletion: runner-temporary files retain their existing lifecycle.
- Privacy: the helper reduces the reachable filesystem surface and must not log
  event or file contents.
- Concurrency: each job keeps its existing runner-owned unique command files.
- Resilience: invalid or missing paths fail closed; incomplete changed-file
  evidence continues to force the full gate.
- Performance: realpath/stat checks are constant bounded local filesystem
  operations and insignificant relative to API and gate work.
- Observability: concise path-boundary errors are sufficient; no new telemetry
  or product metric is warranted.
- Abuse case: a caller supplies traversal, absolute external, prefix-collision
  or symlink paths. Expected result is rejection before the filesystem sink.
- Rollback: revert the exact slice. A rollback that reopens CodeQL alerts must
  not be merged as normal recovery.

## Review and Merge

Root owns scope, current-head review, merge, automatic-CD containment,
exact-main health, cleanup and tracker closeout.

`IDA-SEC08a` is ready to merge only when:

- the exact current head retains the fourteen-path writer map;
- focused containment and regression tests pass;
- all three CodeQL alerts are closed or the exact head contains evidence that
  the next main scan will close them;
- all current-head GitHub required checks are terminal green or explicitly
  classified by current authority;
- no current-head reviewer, Sonar, CodeQL, security or finalizer blocker
  remains.

Immediately after merge, root must identify and cancel only the exact automatic
CD run before registry login, image build, provider contact or deploy.
Cancellation is containment, not deployment authority. If cancellation loses
that boundary, root records the exact failed-containment evidence and stops
before any new slice.

## Explicit Non-Authority

```yaml
runtime_authorized: false
workflow_dispatch_authorized: false
provider_contact_authorized: false
alias_mutation_authorized: false
environment_mutation_authorized: false
deployment_authorized: false
production_authorized: false
release_authorized: false
product_database_authorized: false
z620_runner_or_cd_authorized: false
```

Z620 remains the sole primary local Docker/Supabase/PostgreSQL host but is
local-only and untouched by this docs-only gate. Mac Docker remains retired
and off.

## Stop Conditions

Stop and return to current authority on:

- any fifteenth implementation path;
- any workflow change in `IDA-SEC08a` or any policy-semantic change;
- any fallback trust root or path suppression;
- any application/runtime integration, database, provider or deployment need;
- any protected-surface or product/UI need;
- base drift before runtime authority;
- failed containment or regression proof;
- unresolved current-head Sonar, CodeQL, security, finalizer or reviewer
  finding.
