---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG07
slice: IDA-SEC07
revision: R0
date: 2026-07-25
authority: root-orchestrator
---

# IDA-SEC-DG07 — body-parser Invalid-Limit DoS Remediation

## Decision

Promote exactly one dependency-security slice: `IDA-SEC07`.

`IDA-SEC07` adds an exact workspace override for `body-parser@2.3.0`, the
patched release for the affected 2.x line in `GHSA-v422-hmwv-36x6` /
`CVE-2026-12590`, and regenerates the lockfile without unrelated dependency
movement.

This docs-only gate authorizes no implementation. Repository implementation may
begin only after this gate is canonical and a separate exact runtime-authority
receipt binds the then-current `main`.

## Classification

- Gate class: current-authority/design-gate promotion.
- Gate risk: Tier 0 because it changes only canonical plan/tracker evidence and
  deterministic repository-size metadata.
- Prospective implementation class: narrow transitive runtime dependency
  security patch.
- Prospective implementation risk: Tier 1 because the selected change is an
  exact compatible dependency override and lockfile update outside UI, auth,
  tenancy, routing, schema, RLS, billing, AI trust surfaces and shared
  verification infrastructure.
- Pre-push profile: `FULL`, selected because the affected package has a
  production-runtime path through Inngest even though the exact patch remains
  Tier 1.

The implementation escalates and stops if repository evidence requires any
application, package-parent, workflow, database, provider, runtime integration
or protected-surface change.

## Authority Base

- Repository:
  `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `4db29eea8f3be08708ca5c003ba8527d26216ece`
- Base tree: `00f880754e6066510caf8ff5493acf0d77fcf8e4`
- Branch before gate:
  `codex/ida-sec-dg07-body-parser-current-authority`
- Upstream before branch creation: `origin/main`
- Ahead/behind before branch creation: `0/0`
- Resolver before gate: `blocked_requires_current_authority`
- Active slice before gate: `null`
- AI OS observation:
  `9069fe63fb9c3ae76528bb8b8195b812ac0d0c63336d961802a3d2c8f3259d14`
- AI OS authority state before gate: `current`
- AI OS runtime state before gate: `not_authorized`
- AI OS contradictions before gate: none
- Active-execution authority: `advisory_only`

The Obsidian/Wiki dashboard was used only for orientation. AI OS supplied
current-state, integrity and hold context. Repository source, the current
program/tracker, GitHub alert evidence and package-manager resolution are the
authority for this decision. Brain retrieval was stale and failed closed after
detecting newly landed repo authority; no Brain index, retrieval, ranking or
memory truth was changed.

The immediately preceding `IDA-SEC06` closeout is canonical at main
`4db29eea8f3be08708ca5c003ba8527d26216ece`. Exact-main Sonar, CodeQL, Secret
Scan and every non-E2E CI job passed. Its E2E job failed before test execution
because the GitHub runner could not bind Supabase mail port `54324`, retried the
same environment once inside the existing gatekeeper and encountered the same
port collision. The docs-only closeout introduced no runtime change, and the
exact implementation head had already passed its required current-head gates.
That runner-environment failure is classified without dispatching or rerunning
the workflow and supplies no authority to weaken future E2E proof.

## Trigger Evidence

1. GitHub Dependabot alert `#157` is open for transitive `body-parser` in
   `pnpm-lock.yaml`.
2. The advisory is `GHSA-v422-hmwv-36x6` / `CVE-2026-12590`, severity `low`,
   CWE-770 and CVSS `3.7`: an invalid `limit` value can cause
   `bytes.parse()` to return `null`, silently skip request-size enforcement and
   permit excessive memory or CPU consumption.
3. The affected current range is `>=2.0.0 <2.3.0`; the patched 2.x release is
   `2.3.0`. The separate fixed 1.x release is not relevant to the selected
   dependency graph.
4. The lockfile currently resolves `body-parser@2.2.2`.
5. `pnpm why body-parser --recursive` proves both development/QA and runtime
   paths:

   ```text
   interdomestik
   -> @upstash/context7-mcp@2.3.0
   -> @modelcontextprotocol/sdk@1.29.0
   -> express@5.2.1
   -> body-parser@2.2.2

   @interdomestik/qa
   -> @modelcontextprotocol/sdk@1.29.0
   -> express@5.2.1
   -> body-parser@2.2.2

   apps/web / @interdomestik/domain-communications
   -> inngest@3.54.0
   -> express@5.2.1 peer
   -> body-parser@2.2.2
   ```

6. GitHub labels the alert dependency scope as development from the lockfile
   manifest, but the live repository graph also includes the Inngest runtime
   path. Risk selection therefore follows repository resolution rather than
   relying only on the alert label.
7. `express@5.2.1` declares `body-parser:^2.2.1`; exact `2.3.0` is semver
   compatible. `body-parser@2.3.0` supports Node.js `>=18`, while the repository
   uses a compatible Node version.
8. The repository has no direct `body-parser` source import or direct
   programmatic `limit` configuration. That lowers observed exploit
   reachability but does not make the open runtime supply-chain finding
   acceptable.
9. Broad grouped dependency PRs `#1422` and `#1432` are stale, broad and not
   direct-merge candidates. They must not be used to bypass a current-main,
   exact-package remediation.
10. The accepted existing-issue clean-main bridge requires each open
    Dependabot alert to receive a compatible fix or evidence-backed terminal
    disposition, prioritizing the smallest compatible current-main change.
    `IDA-SEC07` is the smallest compatible patch for alert `#157`.

Grouped PRs `#1422` / `#1432`, frozen `IDA-UI03a2`, the pre-push profile
resolver follow-up and every product/architecture successor remain separate.
They must not be bundled into `IDA-SEC07`.

## Exact Implementation Contract

The future implementation must add exactly this override:

```yaml
overrides:
  body-parser: 2.3.0
```

The implementation must:

1. add only the exact `body-parser: 2.3.0` workspace override;
2. regenerate `pnpm-lock.yaml` with the repository package manager;
3. preserve `express`, `inngest`, `@modelcontextprotocol/sdk`,
   `@upstash/context7-mcp` and every unrelated package resolution;
4. permit only deterministic target-subtree lock movement required by
   `body-parser@2.3.0`;
5. produce a frozen-installable lockfile;
6. prove every selected dependency path resolves to `body-parser@2.3.0`;
7. prove `GHSA-v422-hmwv-36x6` / `CVE-2026-12590` is absent from the audit
   result;
8. prove the QA MCP package and Inngest-dependent packages remain compatible;
9. add no audit allowlist, suppression, waiver or vulnerability-policy change;
10. add no application code, request-parser configuration, runtime
    configuration, workflow, database, provider, deployment or production
    change.

If lock regeneration moves an unrelated package, if `2.3.0` is incompatible
with a selected parent, or if the fix requires a parent/package source change,
the writer stops and returns to current authority rather than expanding scope.

## RED → GREEN Proof

RED is repository evidence on the exact authority base:

- the lockfile selects `body-parser@2.2.2`;
- both development/QA and runtime dependency paths resolve to `2.2.2`;
- GitHub Dependabot alert `#157` is open;
- the selected 2.x version is within `>=2.0.0 <2.3.0`.

GREEN must prove:

- the workspace override equals exact `body-parser: 2.3.0`;
- the lock override and package snapshot select `2.3.0`;
- no `body-parser@2.2.2` or other affected 2.x resolution remains;
- `pnpm install --frozen-lockfile` succeeds;
- `pnpm why` and recursive `pnpm list` resolve all selected paths only to
  `2.3.0`;
- QA and Inngest-dependent package proof passes against the selected graph;
- full audit JSON contains neither `GHSA-v422-hmwv-36x6` nor
  `CVE-2026-12590`;
- production high and critical audit totals remain zero;
- repository security, size and diff checks pass.

The target-advisory assertion is mandatory because a high-only audit threshold
would not prove removal of this low-severity advisory. Other advisory IDs must
be classified separately and may not be silently suppressed.

## Future Writer Map

The future `IDA-SEC07` writer map is exactly three paths:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fourth path stops the slice and returns to current authority. In particular,
the future writer must not edit:

- application, package, MCP or Inngest source;
- package manifests, tests, workflows, composite actions or audit policy;
- `apps/web/src/proxy.ts`, canonical routes, auth, tenancy or session behavior;
- schema, RLS, migrations, database state or database tooling;
- billing, provider, alias, deployment or production surfaces;
- README, AGENTS, architecture docs, Brain/AI OS tooling or product UI;
- preserved worktrees, stashes or Z620 evidence/state.

## Required Implementation Proof

After canonical gate merge and separate exact runtime authority, the sole
writer must run:

1. exact base-to-head three-path scope audit and `git diff --check`;
2. exact override and lockfile version assertions;
3. `pnpm install --frozen-lockfile`;
4. `pnpm why body-parser --recursive`;
5. `pnpm list body-parser --recursive --depth 20`;
6. `pnpm --filter @interdomestik/qa build`;
7. focused `@interdomestik/domain-communications` / Inngest compatibility proof;
8. `pnpm audit --json` with explicit target-advisory absence;
9. `pnpm audit --prod --audit-level=high`;
10. `pnpm security:guard`;
11. `pnpm test:ci:contracts`;
12. `pnpm repo:size:check` and `git diff --check`;
13. `pnpm slice:verify`;
14. repository-mandatory `pnpm pr:verify` and `pnpm e2e:gate`;
15. all current-head GitHub CI, E2E, Pilot, Sonar, CodeQL, secret scan,
    dependency/security and finalizer checks;
16. current-head Codex review and zero unresolved actionable review threads.

Because the selected package has a production-runtime path, the exact
candidate SHA must use the `FULL` pre-push profile through the canonical
task-isolated Z620 runner before push. The selected proof includes validation,
audit/contracts, static, unit, database, production build, E2E PR, E2E merge
and Pilot lanes. Each runtime lane must use a disposable task-owned database,
unique task-owned port and task-owned evidence namespace. Release/deploy lanes
remain unselected and separately unauthorized.

Copilot is unavailable until its user quota renews. Its absence must be
recorded explicitly and must not be represented as approval. No local full gate
may disturb baseline SSH listeners, use Mac Docker or reuse another task's DB,
port, lock, evidence or permit.

## Review and Merge

Root owns scope, current-head review, merge, automatic-CD containment,
exact-main health, cleanup and tracker closeout.

The implementation is ready to merge only when:

- the exact current head retains the three-path writer map;
- the target advisory is absent;
- frozen install, focused proof and exact-SHA FULL proof pass;
- all current-head GitHub required checks are terminal green or explicitly
  classified by current authority;
- Dependabot alert `#157` is fixed or has exact merge-head evidence showing it
  will close;
- no current-head reviewer, Sonar, CodeQL, security or finalizer blocker
  remains.

Immediately after merge, root must identify and cancel only the exact automatic
CD run before registry login, image build, provider contact or deploy.
Cancellation is containment, not deployment authority. If cancellation loses
that boundary, root records an incident stop and seeks explicit disposition.

## Rollback and Residual Risk

The override is reversible, but a rollback that restores a vulnerable version
must not be merged as normal recovery. Compatibility failure returns to current
authority for a patched parent release or a separately reviewed strategy.

Residual risk after the exact patch is limited to invalid-limit behavior in
other parser implementations, undiscovered dependency defects and separate
advisories in the graph. This slice does not claim product-level body-parser
configuration hardening because the repository has no direct configuration
surface in the selected scope.

## Explicit Non-Authority

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
local-only and untouched by this docs-only gate. Mac Docker remains retired and
off.

Grouped PRs `#1422` / `#1432`, frozen `IDA-UI03a2`, the pre-push profile
resolver follow-up, UI/product and every architecture successor remain blocked
or unpromoted.

## Stop Conditions

Stop and return to current authority on:

- any fourth implementation path;
- any unrelated lockfile movement;
- any need to update `express`, `inngest`, `@modelcontextprotocol/sdk`,
  `@upstash/context7-mcp`, a package manifest, test, workflow or source;
- any audit allowlist, suppression or policy request;
- any application/runtime integration, database, provider or deployment
  change;
- any protected-surface or product/UI need;
- base drift before runtime authority;
- failed exact-version compatibility or frozen-install proof;
- unresolved current-head Dependabot, Sonar, CodeQL, security, finalizer or
  reviewer finding.
