---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG04
slice: IDA-SEC04
revision: R0
date: 2026-07-25
authority: root-orchestrator
---

# IDA-SEC-DG04 — protobufjs Parser DoS Remediation

## Decision

Promote exactly one dependency-security slice: `IDA-SEC04`.

`IDA-SEC04` replaces the current exact workspace override `protobufjs@7.6.3`
with the first patched compatible version, `protobufjs@7.6.5`, and regenerates
the lockfile without unrelated dependency movement.

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
  exact patch-level override and lockfile update outside UI, auth, tenancy,
  routing, schema, RLS, billing, AI trust surfaces and shared verification
  infrastructure.

The implementation escalates and stops if repository evidence requires any
product, runtime integration, package-parent, workflow, database or protected
surface change.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `2c3961f6471987b9901d2579ce66681cbda4fbf4`
- Base tree: `88d2252d7d506313170ea6cb05af93f5a1470b39`
- Branch before gate: `main`
- Upstream: `origin/main`
- Ahead/behind before gate: `0/0`
- Resolver before gate: `blocked_requires_current_authority`
- Active slice before gate: `null`
- AI OS observation:
  `2d9e33c514dd25a3c2e83d3c7a447bccb7a4bb03ea16e0097c8085b1077445f5`
- AI OS runtime state before gate: `not_authorized`
- Active execution: `ida-sec04-protobufjs-154`
- Active-execution authority: `advisory_only`

The Obsidian/Wiki dashboard was used only for orientation. AI OS supplied
current-state, integrity and hold context. Repository source, the current
program/tracker, GitHub alert evidence and package-manager resolution are the
authority for this decision.

A measured Brain session start was attempted once and failed closed because a
different task already owns the open session. That session was not changed or
closed. The tooling hold supplies no authority and does not weaken repository
evidence.

## Trigger Evidence

1. GitHub Dependabot alert `#154` is open for transitive runtime dependency
   `protobufjs` in `pnpm-lock.yaml`.
2. The advisory is `GHSA-j3f2-48v5-ccww` /
   `CVE-2026-59877`, severity `medium`: specially crafted `.proto` option
   syntax can keep the parser in an infinite loop and cause denial of service.
3. The affected compatible range is `>=7.5.0 <=7.6.4`; the first patched 7.x
   release is `7.6.5`.
4. `pnpm-workspace.yaml` currently pins the workspace override to `7.6.3`, and
   the lockfile resolves the affected paths to `7.6.3`.
5. `pnpm why protobufjs --recursive` proves the production path:

   ```text
   apps/web
   -> @interdomestik/domain-communications
   -> inngest@3.54.0
   -> @opentelemetry/auto-instrumentations-node@0.75.0
   -> @opentelemetry/sdk-node@0.217.0
   -> OTLP exporters / @grpc/proto-loader
   -> protobufjs@7.6.3
   ```

6. The product does not claim an attacker-controlled `.proto` upload or parsing
   surface. That lowers observed reachability but does not make the open runtime
   supply-chain finding acceptable.
7. Current program/tracker Rev 160 names alert `#154` and patched version
   `7.6.5` as the next bounded security candidate while explicitly withholding
   implementation authority. This gate performs that missing promotion only.

Other open Dependabot alerts and the stale broad dependency PRs remain separate.
They must not be bundled into `IDA-SEC04`.

## Exact Implementation Contract

The future implementation must make exactly this semantic change:

```yaml
overrides:
  protobufjs: 7.6.5
```

The implementation must:

1. change only the existing `protobufjs` override from `7.6.3` to exact
   `7.6.5`;
2. regenerate `pnpm-lock.yaml` with the repository package manager;
3. preserve `inngest`, OpenTelemetry, gRPC and every unrelated dependency
   version;
4. produce a frozen-installable lockfile;
5. prove every selected runtime path resolves to `protobufjs@7.6.5`;
6. prove `GHSA-j3f2-48v5-ccww` / `CVE-2026-59877` is absent from the production
   audit result;
7. add no audit allowlist, suppression, waiver or vulnerability-policy change;
8. add no application code, parser behavior, runtime configuration, provider,
   database, workflow, deployment or production change.

If lock regeneration moves any unrelated package or if `7.6.5` is incompatible
with the current dependency graph, the writer stops and returns to current
authority rather than expanding scope.

## RED → GREEN Proof

RED is repository evidence on the exact authority base:

- workspace override equals `protobufjs: 7.6.3`;
- `pnpm why protobufjs --recursive` resolves the selected runtime paths to
  `7.6.3`;
- GitHub Dependabot alert `#154` is open against the lockfile.

GREEN must prove:

- workspace override equals exact `protobufjs: 7.6.5`;
- lock importer and package snapshots contain `7.6.5` for the selected paths;
- no `protobufjs@7.6.3` or other vulnerable 7.x resolution remains;
- `pnpm install --frozen-lockfile` succeeds;
- `pnpm why protobufjs --recursive` resolves the affected paths only to
  `7.6.5`;
- production audit JSON contains neither `GHSA-j3f2-48v5-ccww` nor
  `CVE-2026-59877`;
- production high and critical audit totals remain zero;
- repository security, size and diff checks pass.

The target advisory assertion is mandatory because a high-only audit threshold
would not prove removal of this medium advisory. Other advisory IDs must be
classified separately and may not be silently suppressed.

## Future Writer Map

The future `IDA-SEC04` writer map is exactly three paths:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fourth path stops the slice and returns to current authority. In particular,
the future writer must not edit:

- application or package source;
- tests, workflows, composite actions or audit policy;
- `apps/web/src/proxy.ts`, canonical routes, auth, tenancy or session behavior;
- schema, RLS, migrations, database state or database tooling;
- billing, provider, alias, deployment or production surfaces;
- README, AGENTS, architecture docs, Brain/AI OS tooling or product UI;
- preserved worktrees, stashes or P8 evidence/state.

## Required Implementation Proof

After canonical gate merge and separate exact runtime authority, the sole writer
must run:

1. exact base-to-head three-path scope audit and `git diff --check`;
2. exact version assertions for override and lockfile;
3. `pnpm install --frozen-lockfile`;
4. `pnpm why protobufjs --recursive`;
5. `pnpm audit --prod --json` with explicit target-advisory absence and
   high/critical zero assertions;
6. `pnpm security:guard`;
7. `pnpm repo:size:check`;
8. `pnpm slice:verify`;
9. the repository-mandatory `pnpm pr:verify` and `pnpm e2e:gate` before merge,
   using only the canonical task-isolated Z620 runner if Docker, PostgreSQL or
   browser runtime is required;
10. all current-head GitHub CI, E2E, Pilot, Sonar, CodeQL, secret scan,
    dependency/security and finalizer checks;
11. current-head Codex/Copilot feedback and zero unresolved actionable review
    threads.

No local full gate may disturb baseline SSH listeners, use Mac Docker or reuse
another task's DB, port, lock, evidence or permit.

## Review and Merge

Root owns scope, current-head review, merge, automatic-CD containment, exact-main
health, cleanup and tracker closeout.

The implementation is ready to merge only when:

- the exact current head retains the three-path writer map;
- the target advisory is absent;
- frozen install and required local/remote gates pass;
- Dependabot alert `#154` is fixed or has exact merge-head evidence showing it
  will close;
- no current-head reviewer, Sonar, CodeQL, security or finalizer blocker
  remains.

Immediately after merge, root must identify and cancel only the exact automatic
CD run before registry login, image build, provider contact or deploy.
Cancellation is containment, not deployment authority. If cancellation loses
that boundary, root records an incident stop and seeks explicit disposition.

## Rollback and Residual Risk

The patch is reversible by reverting the override and lockfile, but a rollback
that restores a vulnerable version must not be merged as a normal recovery.
Compatibility failure returns to current authority for a different patched
version or parent-dependency strategy.

Residual risk after the exact patch is limited to undiscovered parser defects
and separate advisories in the dependency graph. This slice does not claim
product-level `.proto` parser hardening or runtime input validation.

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

Frozen `IDA-UI03a2`, UI/product, runtime AI, Eval v2 and every other successor
remain blocked or unpromoted.

## Stop Conditions

Stop and return to current authority on:

- any fourth implementation path;
- any unrelated lockfile movement;
- any need to upgrade `inngest`, OpenTelemetry, gRPC or another package;
- any audit allowlist, suppression or policy request;
- any application/parser/runtime, workflow, database, provider or deployment
  change;
- any protected-surface or product/UI need;
- base drift before runtime authority;
- failed exact-version compatibility or frozen-install proof;
- unresolved current-head Dependabot, Sonar, CodeQL, security, finalizer or
  reviewer finding.
