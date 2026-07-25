---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG06
slice: IDA-SEC06
revision: R0
date: 2026-07-25
authority: root-orchestrator
---

# IDA-SEC-DG06 — Hono Node Server Path-Traversal Remediation

## Decision

Promote exactly one dependency-security slice: `IDA-SEC06`.

`IDA-SEC06` adds an exact workspace override for
`@hono/node-server@2.0.5`, the first patched release for
`GHSA-frvp-7c67-39w9`, and regenerates the lockfile without unrelated
dependency movement.

This docs-only gate authorizes no implementation. Repository implementation may
begin only after this gate is canonical and a separate exact runtime-authority
receipt binds the then-current `main`.

## Classification

- Gate class: current-authority/design-gate promotion.
- Gate risk: Tier 0 because it changes only canonical plan/tracker evidence and
  deterministic repository-size metadata.
- Prospective implementation class: narrow transitive development dependency
  security patch.
- Prospective implementation risk: Tier 1 because the selected change is an
  exact dependency override and lockfile update outside UI, auth, tenancy,
  routing, schema, RLS, billing, AI trust surfaces and shared verification
  infrastructure.

The implementation escalates and stops if repository evidence requires any
application, package-parent, workflow, database, provider, runtime integration
or protected-surface change.

## Authority Base

- Repository:
  `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `aae2ef761d61772fb6932e8233aa80a45a00e422`
- Base tree: `c45e3eef53ebaab103e8d3152dd00fce60d5a4d0`
- Branch before gate:
  `codex/ida-sec-dg06-hono-path-traversal-current-authority`
- Upstream before branch creation: `origin/main`
- Ahead/behind before branch creation: `0/0`
- Resolver before gate: `blocked_requires_current_authority`
- Active slice before gate: `null`
- AI OS observation:
  `92ea6c6b9c2d1b7c90c454585b58f73a40097f89051081bd41e2785e675873d9`
- AI OS runtime state before gate: `not_authorized`
- Active-execution authority: `advisory_only`

The Obsidian/Wiki dashboard was used only for orientation. AI OS supplied
current-state, integrity and hold context. Repository source, the current
program/tracker, GitHub alert evidence and package-manager resolution are the
authority for this decision. Brain retrieval was stale and failed closed; no
Brain authority or time-saving claim is made.

## Trigger Evidence

1. GitHub Dependabot alert `#158` is open for transitive development
   dependency `@hono/node-server` in `pnpm-lock.yaml`.
2. The advisory is `GHSA-frvp-7c67-39w9`, severity `medium`, CWE-22 and CVSS
   `5.9`: on Windows, encoded backslashes can bypass prefix-mounted middleware
   around `serve-static` and expose files below the configured static root.
   Directory escape outside that root remains blocked.
3. The vulnerable range is `<2.0.5`; the first patched release is `2.0.5`.
4. The lockfile currently resolves `@hono/node-server@1.19.13` through two
   development/QA paths:

   ```text
   interdomestik
   -> @upstash/context7-mcp@2.3.0
   -> @modelcontextprotocol/sdk@1.29.0
   -> @hono/node-server@1.19.13

   @interdomestik/qa
   -> @modelcontextprotocol/sdk@1.29.0
   -> @hono/node-server@1.19.13
   ```

5. The current package-manager audit reports advisory `1124006` /
   `GHSA-frvp-7c67-39w9` against exact version `1.19.13`.
6. `@modelcontextprotocol/sdk@1.29.0` is the latest published parent and still
   declares `@hono/node-server:^1.19.9`; no patched parent release currently
   exists.
7. Hono Node Server v2 keeps the public server API used by the parent package.
   Its documented breaking boundaries are Node.js 18 retirement and removal of
   the Vercel-specific adapter. This repository requires Node.js 24, imports no
   `@hono/node-server/vercel` entrypoint and has no direct
   `@hono/node-server` source import.
8. Broad development Dependabot PR `#1422` is not a direct-merge candidate and
   does not close this alert: its current exact head still resolves
   `@hono/node-server@1.19.13`, even though it moves `hono` to `4.12.32`.
9. The accepted existing-issue clean-main bridge requires each open Dependabot
   alert to receive a compatible fix or evidence-backed terminal disposition,
   prioritizing the smallest compatible current-main change. `IDA-SEC06` is the
   smallest patch that satisfies that rule.

Alert `#157`, CodeQL findings, grouped development PR `#1422`, grouped
production PR `#1432`, frozen `IDA-UI03a2` and all product/architecture
successors remain separate. They must not be bundled into `IDA-SEC06`.

## Exact Implementation Contract

The future implementation must add exactly this override:

```yaml
overrides:
  '@hono/node-server': 2.0.5
```

The implementation must:

1. add only the exact `@hono/node-server: 2.0.5` workspace override;
2. regenerate `pnpm-lock.yaml` with the repository package manager;
3. preserve `@modelcontextprotocol/sdk`, `@upstash/context7-mcp`, `hono` and
   every unrelated dependency version;
4. produce a frozen-installable lockfile;
5. prove every selected dependency path resolves to
   `@hono/node-server@2.0.5`;
6. prove `GHSA-frvp-7c67-39w9` is absent from the audit result;
7. prove the QA MCP package compiles against the selected dependency graph;
8. add no audit allowlist, suppression, waiver or vulnerability-policy change;
9. add no application code, MCP source, runtime configuration, workflow,
   database, provider, deployment or production change.

If lock regeneration moves an unrelated package, if v2 is incompatible with
the current parent dependency, or if the fix requires a parent/package source
change, the writer stops and returns to current authority rather than expanding
scope.

## RED → GREEN Proof

RED is repository evidence on the exact authority base:

- the lockfile selects `@hono/node-server@1.19.13`;
- both selected dependency paths resolve to `1.19.13`;
- package-manager audit reports `GHSA-frvp-7c67-39w9`;
- GitHub Dependabot alert `#158` is open;
- broad PR `#1422` also retains vulnerable `1.19.13`.

GREEN must prove:

- the workspace override equals exact `@hono/node-server: 2.0.5`;
- the lock importer and package snapshot select `2.0.5`;
- no `@hono/node-server@1.19.13` or other affected resolution remains;
- `pnpm install --frozen-lockfile` succeeds;
- `pnpm why` and recursive `pnpm list` resolve both selected paths only to
  `2.0.5`;
- `@interdomestik/qa` compiles against the selected graph;
- audit JSON contains no `GHSA-frvp-7c67-39w9`;
- production high and critical audit totals remain zero;
- repository security, size and diff checks pass.

The target-advisory assertion is mandatory because a high-only audit threshold
would not prove removal of this medium advisory. Other advisory IDs must be
classified separately and may not be silently suppressed.

## Future Writer Map

The future `IDA-SEC06` writer map is exactly three paths:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fourth path stops the slice and returns to current authority. In particular,
the future writer must not edit:

- application, package or MCP source;
- package manifests, tests, workflows, composite actions or audit policy;
- `apps/web/src/proxy.ts`, canonical routes, auth, tenancy or session behavior;
- schema, RLS, migrations, database state or database tooling;
- billing, provider, alias, deployment or production surfaces;
- README, AGENTS, architecture docs, Brain/AI OS tooling or product UI;
- preserved worktrees, stashes or Z620 evidence/state.

## Required Implementation Proof

After canonical gate merge and separate exact runtime authority, the sole writer
must run:

1. exact base-to-head three-path scope audit and `git diff --check`;
2. exact override and lockfile version assertions;
3. `pnpm install --frozen-lockfile`;
4. `pnpm why @hono/node-server --recursive`;
5. `pnpm list @hono/node-server --recursive --depth 20`;
6. `pnpm --filter @interdomestik/qa build`;
7. `pnpm audit --json` with explicit target-advisory absence and
   high/critical-zero assertions;
8. `pnpm security:guard`;
9. `pnpm repo:size:check`;
10. `pnpm slice:verify`;
11. repository-mandatory `pnpm pr:verify` and `pnpm e2e:gate` before merge,
    using only the canonical task-isolated Z620 runner if Docker, PostgreSQL or
    browser runtime is required;
12. all current-head GitHub CI, E2E, Pilot, Sonar, CodeQL, secret scan,
    dependency/security and finalizer checks;
13. current-head Codex review and zero unresolved actionable review threads.

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
- frozen install and required local/remote gates pass;
- Dependabot alert `#158` is fixed or has exact merge-head evidence showing it
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

Residual risk after the exact patch is limited to undiscovered adapter defects,
future parent incompatibility and separate advisories in the dependency graph.
This slice does not claim application static-file hardening because the
affected dependency is development/QA transitive and the repository has no
direct adapter import.

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

Alert `#157`, grouped PRs `#1422` / `#1432`, frozen `IDA-UI03a2`, UI/product
and every architecture successor remain blocked or unpromoted.

## Stop Conditions

Stop and return to current authority on:

- any fourth implementation path;
- any unrelated lockfile movement;
- any need to update `@modelcontextprotocol/sdk`, `@upstash/context7-mcp`,
  `hono`, a package manifest or source;
- any audit allowlist, suppression or policy request;
- any MCP/application/runtime, workflow, database, provider or deployment
  change;
- any protected-surface or product/UI need;
- base drift before runtime authority;
- failed exact-version compatibility or frozen-install proof;
- unresolved current-head Dependabot, Sonar, CodeQL, security, finalizer or
  reviewer finding.
