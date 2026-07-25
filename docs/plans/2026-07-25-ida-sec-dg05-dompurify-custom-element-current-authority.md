---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG05
slice: IDA-SEC05
revision: R0
date: 2026-07-25
authority: root-orchestrator
---

# IDA-SEC-DG05 — DOMPurify Custom-Element Hook Remediation

## Decision

Promote exactly one dependency-security slice: `IDA-SEC05`.

`IDA-SEC05` replaces the current exact workspace override
`dompurify@3.4.11` with the first patched compatible version,
`dompurify@3.4.12`, and regenerates the lockfile without unrelated dependency
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
  exact patch-level override and lockfile update outside UI, auth, tenancy,
  routing, schema, RLS, billing, AI trust surfaces and shared verification
  infrastructure.

The implementation escalates and stops if repository evidence requires any
product, runtime integration, package-parent, workflow, database or protected
surface change.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `f53ded0a15ed28f4c07637bc433883f0a71d1bdf`
- Base tree: `5f82869fd219b12695f73a286110486b3bdccdb1`
- Branch before gate:
  `codex/ida-sec-dg05-dompurify-current-authority`
- Upstream before branch creation: `origin/main`
- Ahead/behind before branch creation: `0/0`
- Resolver before gate: `blocked_requires_current_authority`
- Active slice before gate: `null`
- AI OS observation:
  `aad1d12cdf0db0fd9068edbd12f732202df38cf3b9d7b6d28e05dc21bbbfec16`
- AI OS runtime state before gate: `not_authorized`
- Active-execution authority: `advisory_only`

The Obsidian/Wiki dashboard was used only for orientation. AI OS supplied
current-state, integrity and hold context. Repository source, the current
program/tracker, GitHub alert evidence and package-manager resolution are the
authority for this decision. Brain retrieval was stale and failed closed; no
Brain authority or time-saving claim is made.

## Trigger Evidence

1. GitHub Dependabot alert `#159` is open for transitive runtime dependency
   `dompurify` in `pnpm-lock.yaml`.
2. The advisory is `GHSA-c2j3-45gr-mqc4`, severity `low`:
   `CUSTOM_ELEMENT_HANDLING` can allow a custom element to bypass the
   `afterSanitizeElements` hook policy. The preserved value is inert at
   sanitize time, but an application-defined custom element that later writes
   it into an HTML sink can create a second-order XSS gadget.
3. The vulnerable range is `<=3.4.11`; the first patched compatible release is
   `3.4.12`.
4. `pnpm-workspace.yaml` currently pins the workspace override to `3.4.11`, and
   the lockfile resolves the affected runtime path to `3.4.11`.
5. `pnpm list dompurify --recursive --depth 20` proves the runtime path:

   ```text
   @interdomestik/web
   -> posthog-js@1.396.2
   -> dompurify@3.4.11
   ```

6. The current repository does not claim that Interdomestik enables
   `CUSTOM_ELEMENT_HANDLING`, depends on `afterSanitizeElements` as an
   application security policy or defines the second-order custom-element sink
   described by the advisory. That lowers demonstrated reachability but does
   not make the open runtime supply-chain finding acceptable.
7. Broad production Dependabot PR `#1432` is not a direct-merge candidate and
   does not close this alert: its PostHog update still resolves
   `dompurify@3.4.11` because the current workspace override remains binding.
8. The accepted existing-issue clean-main bridge requires each open Dependabot
   alert to receive a compatible fix or evidence-backed terminal disposition,
   prioritizing verified runtime exposure and the smallest compatible change.
   `IDA-SEC05` is the smallest current runtime patch that satisfies that rule.

Alerts `#157` and `#158`, CodeQL findings, grouped development PR `#1422` and
grouped production PR `#1432` remain separate. They must not be bundled into
`IDA-SEC05`.

## Exact Implementation Contract

The future implementation must make exactly this semantic change:

```yaml
overrides:
  dompurify: 3.4.12
```

The implementation must:

1. change only the existing `dompurify` override from `3.4.11` to exact
   `3.4.12`;
2. regenerate `pnpm-lock.yaml` with the repository package manager;
3. preserve `posthog-js` and every unrelated dependency version;
4. produce a frozen-installable lockfile;
5. prove every selected runtime path resolves to `dompurify@3.4.12`;
6. prove `GHSA-c2j3-45gr-mqc4` is absent from the production audit result;
7. add no audit allowlist, suppression, waiver or vulnerability-policy change;
8. add no application code, sanitizer configuration, custom-element behavior,
   runtime configuration, provider, database, workflow, deployment or
   production change.

If lock regeneration moves any unrelated package or if `3.4.12` is
incompatible with the current dependency graph, the writer stops and returns
to current authority rather than expanding scope.

## RED → GREEN Proof

RED is repository evidence on the exact authority base:

- workspace override equals `dompurify: 3.4.11`;
- the selected runtime path resolves to `dompurify@3.4.11`;
- GitHub Dependabot alert `#159` is open against the lockfile;
- broad production PR `#1432` retains `dompurify@3.4.11`.

GREEN must prove:

- workspace override equals exact `dompurify: 3.4.12`;
- lock importer and package snapshot contain `3.4.12` for the selected path;
- no `dompurify@3.4.11` or other affected resolution remains;
- `pnpm install --frozen-lockfile` succeeds;
- `pnpm list dompurify --recursive --depth 20` resolves the affected path only
  to `3.4.12`;
- production audit JSON contains no `GHSA-c2j3-45gr-mqc4`;
- production high and critical audit totals remain zero;
- repository security, size and diff checks pass.

The target advisory assertion is mandatory because a high-only audit threshold
would not prove removal of this low advisory. Other advisory IDs must be
classified separately and may not be silently suppressed.

## Future Writer Map

The future `IDA-SEC05` writer map is exactly three paths:

1. `pnpm-workspace.yaml`
2. `pnpm-lock.yaml`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fourth path stops the slice and returns to current authority. In particular,
the future writer must not edit:

- application or package source;
- tests, workflows, composite actions or audit policy;
- `apps/web/src/proxy.ts`, canonical routes, auth, tenancy or session behavior;
- sanitizer configuration, analytics integration or custom elements;
- schema, RLS, migrations, database state or database tooling;
- billing, provider, alias, deployment or production surfaces;
- README, AGENTS, architecture docs, Brain/AI OS tooling or product UI;
- preserved worktrees, stashes or Z620 evidence/state.

## Required Implementation Proof

After canonical gate merge and separate exact runtime authority, the sole writer
must run:

1. exact base-to-head three-path scope audit and `git diff --check`;
2. exact version assertions for override and lockfile;
3. `pnpm install --frozen-lockfile`;
4. `pnpm list dompurify --recursive --depth 20`;
5. `pnpm audit --prod --json` with explicit target-advisory absence and
   high/critical zero assertions;
6. `pnpm security:guard`;
7. `pnpm repo:size:check`;
8. `pnpm slice:verify`;
9. repository-mandatory `pnpm pr:verify` and `pnpm e2e:gate` before merge,
   using only the canonical task-isolated Z620 runner if Docker, PostgreSQL or
   browser runtime is required;
10. all current-head GitHub CI, E2E, Pilot, Sonar, CodeQL, secret scan,
    dependency/security and finalizer checks;
11. current-head Codex/Copilot feedback and zero unresolved actionable review
    threads.

No local full gate may disturb baseline SSH listeners, use Mac Docker or reuse
another task's DB, port, lock, evidence or permit.

## Review and Merge

Root owns scope, current-head review, merge, automatic-CD containment,
exact-main health, cleanup and tracker closeout.

The implementation is ready to merge only when:

- the exact current head retains the three-path writer map;
- the target advisory is absent;
- frozen install and required local/remote gates pass;
- Dependabot alert `#159` is fixed or has exact merge-head evidence showing it
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

Residual risk after the exact patch is limited to undiscovered sanitizer
defects, product misuse of sanitized values and separate advisories in the
dependency graph. This slice does not claim application-level sanitizer,
custom-element or HTML-sink hardening.

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
- any need to upgrade `posthog-js` or another package;
- any audit allowlist, suppression or policy request;
- any application/sanitizer/custom-element/runtime, workflow, database,
  provider or deployment change;
- any protected-surface or product/UI need;
- base drift before runtime authority;
- failed exact-version compatibility or frozen-install proof;
- unresolved current-head Dependabot, Sonar, CodeQL, security, finalizer or
  reviewer finding.
